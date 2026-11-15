import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { logger } from '../../config/logger.js';
export async function recordUsage(input) {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('usage_events').insert({
        workspace_id: input.workspace_id,
        category: input.category,
        quantity: input.quantity,
        unit: input.unit,
        cost: input.cost ?? 0,
        task_id: input.task_id ?? null,
        agent_run_id: input.agent_run_id ?? null,
    });
    if (error) {
        logger.error('Failed to record usage event', { error: error.message, category: input.category });
        throw error;
    }
}
export async function getWorkspaceUsageSummary(workspaceId) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('usage_events')
        .select('category, quantity, unit, cost')
        .eq('workspace_id', workspaceId);
    if (error)
        throw error;
    const byCategory = {};
    let totalCost = 0;
    for (const event of data ?? []) {
        const cat = event.category;
        if (!byCategory[cat]) {
            byCategory[cat] = { quantity: 0, cost: 0, unit: event.unit };
        }
        byCategory[cat].quantity += Number(event.quantity);
        byCategory[cat].cost += Number(event.cost);
        totalCost += Number(event.cost);
    }
    return { total_cost: Number(totalCost.toFixed(6)), by_category: byCategory };
}
export async function checkQuota(workspaceId, category, limit) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('usage_events')
        .select('quantity')
        .eq('workspace_id', workspaceId)
        .eq('category', category);
    if (error)
        throw error;
    const current = (data ?? []).reduce((sum, e) => sum + Number(e.quantity), 0);
    return { exceeded: current >= limit, current, limit };
}
//# sourceMappingURL=usage-service.js.map