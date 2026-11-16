import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { AgentRun } from '../../contracts/types.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../api/middleware/errors.js';
import { AgentRunStatus, type AgentRunStatusValue } from '../../config/constants.js';
import { getOrchestrator, setOrchestrator } from '../../adapters/orchestration/stub-orchestrator.js';
import { isTemporalConfigured } from '../../adapters/temporal/temporal-client.js';
import { getTemporalWorkflowId, TemporalLangGraphOrchestrator } from '../../adapters/orchestration/temporal-orchestrator.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { CreateRunInput, RunSnapshot } from './orchestrator.js';
import { getMembership } from '../tenancy/workspace-service.js';

let orchestratorInitialized = false;

function ensureOrchestrator(): void {
  if (orchestratorInitialized) return;

  if (env.runtime.mode === 'production' && !isTemporalConfigured()) {
    throw new Error('Production mode requires a configured Temporal server. Set TEMPORAL_ADDRESS and ensure the server is running.');
  }

  if (isTemporalConfigured()) {
    logger.info('Initializing Temporal+LangGraph orchestrator');
    setOrchestrator(new TemporalLangGraphOrchestrator());
  } else if (env.runtime.mode === 'production') {
    throw new Error('Production mode requires Temporal — cannot use stub orchestrator');
  }

  orchestratorInitialized = true;
}

export function getActiveOrchestrator() {
  ensureOrchestrator();
  return getOrchestrator();
}

export async function updateAgentRunStatus(agentRunId: string, status: AgentRunStatusValue, metadata?: Record<string, unknown>): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('agent_runs')
    .update({ status, trace_metadata: metadata ?? {}, updated_at: new Date().toISOString() })
    .eq('id', agentRunId);
  if (error) throw error;
}

const ACTIVE_RUN_STATUSES: AgentRunStatusValue[] = [
  AgentRunStatus.CREATED,
  AgentRunStatus.RUNNING,
  AgentRunStatus.PAUSED,
  AgentRunStatus.AWAITING_APPROVAL,
  AgentRunStatus.AWAITING_INPUT,
];

export async function createAgentRun(input: CreateRunInput): Promise<{ agentRun: AgentRun; runReference: { run_id: string; task_id: string; status: string } }> {
  ensureOrchestrator();

  const supabase = getSupabaseAdminClient();
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('workspace_id, user_id')
    .eq('id', input.task_id)
    .maybeSingle();

  if (taskErr) throw taskErr;
  if (!task) throw new NotFoundError('Task', input.task_id);
  if (task.workspace_id !== input.workspace_id || (task.user_id && task.user_id !== input.user_id)) {
    throw new ForbiddenError('Task does not belong to the supplied workspace and user');
  }
  if (!await getMembership(input.workspace_id, input.user_id)) {
    throw new ForbiddenError('User is not a member of the supplied workspace');
  }

  const { data: existingRuns, error: existingErr } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('task_id', input.task_id)
    .in('status', ACTIVE_RUN_STATUSES)
    .order('created_at', { ascending: false });

  if (existingErr) throw existingErr;

  const activeRun = existingRuns?.[0];

  if (activeRun) {
    return {
      agentRun: activeRun as AgentRun,
      runReference: {
        run_id: activeRun.external_run_id ?? activeRun.id,
        task_id: input.task_id,
        status: activeRun.status,
      },
    };
  }

  try {
    const { data, error } = await supabase
      .from('agent_runs')
      .insert({
        task_id: input.task_id,
        orchestrator: isTemporalConfigured() ? 'temporal-langgraph' : 'stub',
        status: AgentRunStatus.CREATED,
        trace_metadata: {},
      })
      .select('*')
      .single();

    if (error) throw error;
    const agentRun = data as AgentRun;

    if (isTemporalConfigured()) {
      const { error: workflowIdErr } = await supabase
        .from('agent_runs')
        .update({ temporal_workflow_id: getTemporalWorkflowId(input.task_id, agentRun.id) })
        .eq('id', agentRun.id);
      if (workflowIdErr) throw workflowIdErr;
    }

    const orchestrator = getOrchestrator();
    const runRef = await orchestrator.createRun({ ...input, agent_run_record_id: agentRun.id });

    const { error: referenceErr } = await supabase
      .from('agent_runs')
      .update({
        external_run_id: runRef.run_id,
        temporal_workflow_id: runRef.run_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentRun.id);

    if (referenceErr) throw referenceErr;

    const { data: startedRun, error: statusErr } = await supabase
      .from('agent_runs')
      .update({ status: AgentRunStatus.RUNNING, updated_at: new Date().toISOString() })
      .eq('id', agentRun.id)
      .eq('status', AgentRunStatus.CREATED)
      .select('*')
      .maybeSingle();

    if (statusErr) throw statusErr;
    const { data: currentRun, error: currentErr } = startedRun
      ? { data: startedRun, error: null }
      : await supabase.from('agent_runs').select('*').eq('id', agentRun.id).maybeSingle();
    if (currentErr) throw currentErr;
    if (!currentRun) throw new NotFoundError('AgentRun', agentRun.id);

    return {
      agentRun: currentRun as AgentRun,
      runReference: { ...runRef, status: currentRun.status },
    };
  } catch (err) {
    const errorCode = typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
    if (errorCode === '23505') {
      const { data: retryRuns, error: retryErr } = await supabase
        .from('agent_runs')
        .select('*')
        .eq('task_id', input.task_id)
        .in('status', ACTIVE_RUN_STATUSES)
        .order('created_at', { ascending: false });
      if (retryErr) throw retryErr;
      const retryRun = retryRuns?.[0];
      if (retryRun) {
        return {
          agentRun: retryRun as AgentRun,
          runReference: {
            run_id: retryRun.external_run_id ?? retryRun.id,
            task_id: input.task_id,
            status: retryRun.status,
          },
        };
      }
    }
    throw err;
  }
}

export async function getAgentRun(id: string): Promise<AgentRun> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('AgentRun', id);
  return data as AgentRun;
}

export async function listTaskAgentRuns(taskId: string): Promise<AgentRun[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AgentRun[];
}

export async function pauseAgentRun(agentRunId: string): Promise<AgentRun> {
  const agentRun = await getAgentRun(agentRunId);
  const orchestrator = getActiveOrchestrator();

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .update({
      status: AgentRunStatus.PAUSED,
      trace_metadata: { ...(agentRun.trace_metadata ?? {}), paused_from_status: agentRun.status },
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentRunId)
    .in('status', [AgentRunStatus.CREATED, AgentRunStatus.RUNNING, AgentRunStatus.AWAITING_APPROVAL, AgentRunStatus.AWAITING_INPUT])
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const currentRun = await getAgentRun(agentRunId);
    if (currentRun.status === AgentRunStatus.PAUSED && currentRun.external_run_id) {
      await orchestrator.pauseRun({ run_id: currentRun.external_run_id, task_id: currentRun.task_id });
    }
    return currentRun;
  }

  if (agentRun.external_run_id) {
    await orchestrator.pauseRun({ run_id: agentRun.external_run_id, task_id: agentRun.task_id });
  }
  return data as AgentRun;
}

export async function cancelAgentRun(agentRunId: string): Promise<AgentRun> {
  const agentRun = await getAgentRun(agentRunId);
  const orchestrator = getActiveOrchestrator();

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .update({ status: AgentRunStatus.CANCELLED, updated_at: new Date().toISOString() })
    .eq('id', agentRunId)
    .in('status', ACTIVE_RUN_STATUSES)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const currentRun = await getAgentRun(agentRunId);
    if (currentRun.status === AgentRunStatus.CANCELLED && currentRun.external_run_id) {
      await orchestrator.cancelRun({ run_id: currentRun.external_run_id, task_id: currentRun.task_id });
    }
    return currentRun;
  }

  if (agentRun.external_run_id) {
    await orchestrator.cancelRun({ run_id: agentRun.external_run_id, task_id: agentRun.task_id });
  }
  return data as AgentRun;
}

export async function resumeAgentRun(agentRunId: string, userInput?: string): Promise<AgentRun> {
  const agentRun = await getAgentRun(agentRunId);
  if (agentRun.status !== AgentRunStatus.PAUSED && agentRun.status !== AgentRunStatus.AWAITING_INPUT) {
    throw new ConflictError(`Cannot resume agent run in status ${agentRun.status}`);
  }
  const resumeFromApproval = agentRun.trace_metadata?.paused_from_status === AgentRunStatus.AWAITING_APPROVAL;
  if (resumeFromApproval && userInput?.trim()) {
    throw new ConflictError('User input cannot replace a pending approval decision');
  }
  const { paused_from_status: _pausedFromStatus, ...traceMetadata } = agentRun.trace_metadata ?? {};
  const nextStatus = resumeFromApproval ? AgentRunStatus.AWAITING_APPROVAL : AgentRunStatus.RUNNING;
  const orchestrator = getActiveOrchestrator();

  if (agentRun.external_run_id) {
    await orchestrator.resumeRun({
      run_id: agentRun.external_run_id,
      task_id: agentRun.task_id,
      user_input: resumeFromApproval ? undefined : userInput,
    });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .update({
      status: nextStatus,
      trace_metadata: traceMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentRunId)
    .in('status', [AgentRunStatus.PAUSED, AgentRunStatus.AWAITING_INPUT])
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ConflictError('Agent run changed state before it could be resumed');
  return data as AgentRun;
}

export async function getRunSnapshot(agentRunId: string): Promise<RunSnapshot> {
  const agentRun = await getAgentRun(agentRunId);
  if (!agentRun.external_run_id) throw new NotFoundError('External run');
  const orchestrator = getOrchestrator();
  return orchestrator.getRun({ run_id: agentRun.external_run_id });
}
