import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
export async function recordAuditEvent(input) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('audit_events')
        .insert({
        workspace_id: input.workspace_id ?? null,
        actor: input.actor,
        action: input.action,
        target: input.target ?? null,
        target_id: input.target_id ?? null,
        correlation_id: input.correlation_id ?? null,
        outcome: input.outcome ?? 'SUCCESS',
        metadata: input.metadata ?? {},
    })
        .select('*')
        .single();
    if (error)
        throw error;
    return data;
}
export async function listWorkspaceAuditEvents(workspaceId, limit = 50, offset = 0) {
    const supabase = getSupabaseAdminClient();
    const { count, error: countErr } = await supabase
        .from('audit_events')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId);
    if (countErr)
        throw countErr;
    const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (error)
        throw error;
    return { events: (data ?? []), total: count ?? 0 };
}
//# sourceMappingURL=audit-service.js.map