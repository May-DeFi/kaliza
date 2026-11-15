import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { ToolInvocation } from '../../contracts/types.js';
import { NotFoundError, ForbiddenError } from '../../api/middleware/errors.js';
import { evaluatePolicy, computeActionHash } from '../policies/policy-engine.js';
import { isApprovalValid } from '../approvals/approval-service.js';
import type { Approval } from '../../contracts/types.js';
import { hashString } from '../../adapters/encryption/crypto.js';
import { logger } from '../../config/logger.js';

export interface ToolDefinition {
  tool_id: string;
  version: string;
  description: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  connector: string | null;
  required_scopes: string[];
  required_entitlements: string[];
  risk: string;
  approval_policy: Record<string, unknown>;
  timeout_ms: number;
  execution_environment: string;
  usage_category: string | null;
  available: boolean;
}

export async function getToolDefinition(toolId: string): Promise<ToolDefinition> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tool_registry')
    .select('*')
    .eq('tool_id', toolId)
    .eq('available', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('Tool', toolId);
  return data as unknown as ToolDefinition;
}

export async function listTools(): Promise<ToolDefinition[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tool_registry')
    .select('*')
    .eq('available', true)
    .order('tool_id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as ToolDefinition[];
}

export async function registerTool(input: {
  tool_id: string;
  version?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  connector?: string;
  required_scopes?: string[];
  required_entitlements?: string[];
  risk?: string;
  execution_environment?: string;
  timeout_ms?: number;
  usage_category?: string;
}): Promise<ToolDefinition> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tool_registry')
    .upsert({
      tool_id: input.tool_id,
      version: input.version ?? '1.0.0',
      description: input.description ?? null,
      input_schema: input.input_schema ?? {},
      output_schema: input.output_schema ?? {},
      connector: input.connector ?? null,
      required_scopes: input.required_scopes ?? [],
      required_entitlements: input.required_entitlements ?? [],
      risk: input.risk ?? 'LOW',
      execution_environment: input.execution_environment ?? 'CORE',
      timeout_ms: input.timeout_ms ?? 30000,
      usage_category: input.usage_category ?? null,
      available: true,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as ToolDefinition;
}

export interface ToolExecutionContext {
  workspace_id: string;
  user_id: string;
  role: string;
  task_id?: string;
  agent_run_id?: string;
  tool_id: string;
  action: string;
  input: Record<string, unknown>;
  approval?: Approval | null;
}

export async function authorizeToolExecution(ctx: ToolExecutionContext): Promise<{
  allowed: boolean;
  reason: string;
  policy_version: string;
  risk: string;
}> {
  const tool = await getToolDefinition(ctx.tool_id);

  const evaluation = evaluatePolicy({
    workspace_id: ctx.workspace_id,
    user_id: ctx.user_id,
    role: ctx.role,
    tool_id: ctx.tool_id,
    action: ctx.action,
    risk_override: tool.risk as 'LOW' | 'MODERATE' | 'HIGH',
  });

  if (evaluation.decision === 'DENY') {
    return { allowed: false, reason: evaluation.reason, policy_version: evaluation.policy_version, risk: evaluation.risk_class };
  }

  if (evaluation.approval_required) {
    if (!ctx.approval) {
      return { allowed: false, reason: 'Approval required but none provided', policy_version: evaluation.policy_version, risk: evaluation.risk_class };
    }
    if (!isApprovalValid(ctx.approval, ctx.input)) {
      return { allowed: false, reason: 'Approval is invalid, expired, or payload mismatch', policy_version: evaluation.policy_version, risk: evaluation.risk_class };
    }
  }

  return { allowed: true, reason: evaluation.reason, policy_version: evaluation.policy_version, risk: evaluation.risk_class };
}

export async function recordToolInvocation(input: {
  task_id?: string;
  agent_run_id?: string;
  workspace_id: string;
  tool_id: string;
  tool_version: string;
  input: Record<string, unknown>;
  output_ref?: string;
  status: string;
  duration_ms?: number;
  error_message?: string;
}): Promise<ToolInvocation> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tool_invocations')
    .insert({
      task_id: input.task_id ?? null,
      agent_run_id: input.agent_run_id ?? null,
      workspace_id: input.workspace_id,
      tool_id: input.tool_id,
      tool_version: input.tool_version,
      input_hash: hashString(JSON.stringify(input.input)),
      output_ref: input.output_ref ?? null,
      status: input.status,
      duration_ms: input.duration_ms ?? null,
      error_message: input.error_message ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as ToolInvocation;
}

export async function listToolInvocations(workspaceId: string, taskId?: string): Promise<ToolInvocation[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from('tool_invocations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (taskId) {
    query = query.eq('task_id', taskId);
  }

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return (data ?? []) as ToolInvocation[];
}
