import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { NotFoundError } from '../../api/middleware/errors.js';
import { evaluatePolicy } from '../policies/policy-engine.js';
import { isApprovalValid } from '../approvals/approval-service.js';
import { hashString } from '../../adapters/encryption/crypto.js';
export async function getToolDefinition(toolId) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('tool_registry')
        .select('*')
        .eq('tool_id', toolId)
        .eq('available', true)
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new NotFoundError('Tool', toolId);
    return data;
}
export async function listTools() {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('tool_registry')
        .select('*')
        .eq('available', true)
        .order('tool_id', { ascending: true });
    if (error)
        throw error;
    return (data ?? []);
}
export async function registerTool(input) {
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
    if (error)
        throw error;
    return data;
}
export async function authorizeToolExecution(ctx) {
    const tool = await getToolDefinition(ctx.tool_id);
    const evaluation = evaluatePolicy({
        workspace_id: ctx.workspace_id,
        user_id: ctx.user_id,
        role: ctx.role,
        tool_id: ctx.tool_id,
        action: ctx.action,
        risk_override: tool.risk,
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
export async function recordToolInvocation(input) {
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
    if (error)
        throw error;
    return data;
}
export async function listToolInvocations(workspaceId, taskId) {
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
    if (error)
        throw error;
    return (data ?? []);
}
//# sourceMappingURL=tool-gateway.js.map