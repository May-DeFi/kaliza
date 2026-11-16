import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { Approval } from '../../contracts/types.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../api/middleware/errors.js';
import { AgentRunStatus, ApprovalStatus, MembershipRole, TaskStatus, type RiskClassValue, type ApprovalStatusValue } from '../../config/constants.js';
import { computeActionHash, hasPayloadChanged } from '../policies/policy-engine.js';
import { recordAuditEvent } from '../audit/audit-service.js';
import { getTemporalClient, isTemporalConfigured } from '../../adapters/temporal/temporal-client.js';
import { logger } from '../../config/logger.js';
import { getMembership } from '../tenancy/workspace-service.js';

export async function createApproval(input: {
  task_id: string;
  workspace_id: string;
  risk: RiskClassValue;
  payload: Record<string, unknown>;
  expiryHours?: number;
}): Promise<Approval> {
  const supabase = getSupabaseAdminClient();
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('workspace_id, user_id, id')
    .eq('id', input.task_id)
    .maybeSingle();

  if (taskErr) throw taskErr;
  if (!task) throw new NotFoundError('Task', input.task_id);
  if (task.workspace_id !== input.workspace_id) {
    throw new ForbiddenError('Task does not belong to the supplied workspace');
  }

  const actionHash = computeActionHash(input.payload);
  const expiry = input.expiryHours
    ? new Date(Date.now() + input.expiryHours * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('approvals')
    .insert({
      task_id: input.task_id,
      workspace_id: input.workspace_id,
      action_hash: actionHash,
      action_version: 1,
      risk: input.risk,
      payload: input.payload,
      decision: ApprovalStatus.PENDING,
      expiry,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Approval;
}

export async function getApproval(id: string): Promise<Approval> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('Approval', id);
  return data as Approval;
}

export async function listTaskApprovals(taskId: string): Promise<Approval[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Approval[];
}

export async function listPendingApprovals(workspaceId: string): Promise<Approval[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('decision', ApprovalStatus.PENDING)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Approval[];
}

export async function decideApproval(input: {
  approval_id: string;
  decision: ApprovalStatusValue;
  approver_id: string;
  workspace_id: string;
  modified_payload?: Record<string, unknown>;
}): Promise<Approval> {
  const validDecisions = [
    ApprovalStatus.APPROVED,
    ApprovalStatus.REJECTED,
    ApprovalStatus.CHANGES_REQUESTED,
  ] as const;

  if (!validDecisions.includes(input.decision as (typeof validDecisions)[number])) {
    throw new ConflictError(`Invalid approval decision: ${String(input.decision)}`);
  }

  const approval = await getApproval(input.approval_id);

  if (approval.workspace_id !== input.workspace_id) {
    throw new ForbiddenError('Approval does not belong to this workspace');
  }

  const membership = await getMembership(input.workspace_id, input.approver_id);
  if (!membership || (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.ADMIN)) {
    throw new ForbiddenError('Approver is not authorized to decide approvals in this workspace');
  }

  const supabase = getSupabaseAdminClient();
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('workspace_id, status')
    .eq('id', approval.task_id)
    .maybeSingle();

  if (taskErr) throw taskErr;
  if (!task || task.workspace_id !== input.workspace_id || task.status !== TaskStatus.AWAITING_APPROVAL) {
    throw new ConflictError('Approval task is no longer awaiting approval in this workspace');
  }

  if (approval.decision !== ApprovalStatus.PENDING) {
    throw new ConflictError('Approval has already been decided');
  }

  if (!approval.expiry || new Date(approval.expiry).getTime() <= Date.now()) {
    await expirePendingApproval(input.approval_id);
    throw new ConflictError('Approval has expired');
  }

  if (input.decision === ApprovalStatus.APPROVED && input.modified_payload) {
    if (hasPayloadChanged(approval.action_hash, input.modified_payload)) {
      throw new ConflictError('Payload has changed — a new approval is required for the modified action');
    }
  }

  if (input.decision === ApprovalStatus.CHANGES_REQUESTED) {
    const newHash = input.modified_payload ? computeActionHash(input.modified_payload) : approval.action_hash;
    const updated = await updateApprovalStatusWithApprover(
      input.approval_id,
      input.decision,
      input.approver_id,
      {
        action_hash: newHash,
        payload: input.modified_payload ?? approval.payload,
      },
    );
    await signalTemporalWorkflowForApproval(approval.task_id, input.approval_id, input.decision);

    await recordAuditEvent({
      workspace_id: input.workspace_id,
      actor: input.approver_id,
      action: 'approval.changes_requested',
      target: 'approval',
      target_id: input.approval_id,
      metadata: { task_id: approval.task_id },
    });

    return updated;
  }

  const updated = await updateApprovalStatusWithApprover(
    input.approval_id,
    input.decision,
    input.approver_id,
  );

  await signalTemporalWorkflowForApproval(approval.task_id, input.approval_id, input.decision);

  await recordAuditEvent({
    workspace_id: input.workspace_id,
    actor: input.approver_id,
    action: `approval.${input.decision.toLowerCase()}`,
    target: 'approval',
    target_id: input.approval_id,
    metadata: { task_id: approval.task_id, risk: approval.risk },
  });

  return updated;
}

async function signalTemporalWorkflowForApproval(taskId: string, approvalId: string, decision: string): Promise<void> {
  if (!isTemporalConfigured()) return;
  try {
    const supabase = getSupabaseAdminClient();
    const { data: agentRun, error } = await supabase
      .from('agent_runs')
      .select('external_run_id, temporal_workflow_id')
      .eq('task_id', taskId)
      .in('status', [
        AgentRunStatus.CREATED,
        AgentRunStatus.RUNNING,
        AgentRunStatus.PAUSED,
        AgentRunStatus.AWAITING_APPROVAL,
        AgentRunStatus.AWAITING_INPUT,
      ])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const workflowId = agentRun?.external_run_id ?? agentRun?.temporal_workflow_id;
    if (!workflowId) {
      logger.warn('No active Temporal workflow found for approval', { taskId, approvalId, decision });
      return;
    }

    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal('approvalDecision', approvalId, decision);
    logger.info('Sent approval signal to Temporal workflow', { workflowId, approvalId, decision });
  } catch (err) {
    logger.warn('Failed to signal Temporal workflow for approval', {
      taskId, approvalId, decision,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function expirePendingApproval(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('approvals')
    .update({ decision: ApprovalStatus.EXPIRED, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('decision', ApprovalStatus.PENDING)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ConflictError('Approval has already been decided');
}

async function updateApprovalStatusWithApprover(
  id: string,
  status: ApprovalStatusValue,
  approverId: string,
  updates: Record<string, unknown> = {},
): Promise<Approval> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('approvals')
    .update({
      ...updates,
      decision: status,
      approver_id: approverId,
      decided_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .eq('decision', ApprovalStatus.PENDING)
    .gt('expiry', now)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ConflictError('Approval is stale, expired, or has already been decided');
  return data as Approval;
}

export function isApprovalValid(approval: Approval, payload: Record<string, unknown>): boolean {
  if (approval.decision !== ApprovalStatus.APPROVED) return false;
  if (new Date(approval.expiry ?? '') < new Date()) return false;
  if (hasPayloadChanged(approval.action_hash, payload)) return false;
  return true;
}

export async function expireStaleApprovals(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('approvals')
    .update({ decision: ApprovalStatus.EXPIRED, updated_at: new Date().toISOString() })
    .eq('decision', ApprovalStatus.PENDING)
    .lt('expiry', new Date().toISOString())
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}
