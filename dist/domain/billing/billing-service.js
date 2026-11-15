import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { recordUsage } from '../usage/usage-service.js';
const PLAN_LIMITS = {
    FREE: { model_tokens: 50000, sandbox_hours: 2, active_workflows: 3, concurrency: 1 },
    STARTER: { model_tokens: 500000, sandbox_hours: 10, active_workflows: 10, concurrency: 3 },
    GROWTH: { model_tokens: 2000000, sandbox_hours: 50, active_workflows: 50, concurrency: 10 },
    SCALE: { model_tokens: 10000000, sandbox_hours: 200, active_workflows: 200, concurrency: 50 },
};
export function getPlanLimits(plan) {
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
}
export async function getOrCreateSubscription(workspaceId, plan = 'FREE') {
    const supabase = getSupabaseAdminClient();
    const { data: existing } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
    if (existing)
        return existing;
    const limits = getPlanLimits(plan);
    const { data, error } = await supabase
        .from('subscriptions')
        .insert({
        workspace_id: workspaceId,
        plan,
        status: 'ACTIVE',
        billing_state: 'CURRENT',
        limits,
    })
        .select('*')
        .single();
    if (error)
        throw error;
    return data;
}
export async function getSubscription(workspaceId) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
    if (error)
        throw error;
    if (!data) {
        return await getOrCreateSubscription(workspaceId);
    }
    return data;
}
export async function upgradePlan(workspaceId, newPlan) {
    const supabase = getSupabaseAdminClient();
    const limits = getPlanLimits(newPlan);
    const { data, error } = await supabase
        .from('subscriptions')
        .upsert({
        workspace_id: workspaceId,
        plan: newPlan,
        status: 'ACTIVE',
        billing_state: 'CURRENT',
        limits,
    })
        .select('*')
        .single();
    if (error)
        throw error;
    return data;
}
export async function checkEntitlement(workspaceId, category) {
    const subscription = await getSubscription(workspaceId);
    const limits = subscription.limits;
    const limit = limits?.[category] ?? 0;
    if (limit === 0)
        return { allowed: false, current: 0, limit: 0, plan: subscription.plan };
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('usage_events')
        .select('quantity')
        .eq('workspace_id', workspaceId)
        .eq('category', category);
    if (error)
        throw error;
    const current = (data ?? []).reduce((sum, e) => sum + Number(e.quantity), 0);
    return { allowed: current < limit, current, limit, plan: subscription.plan };
}
export async function recordBillingCharge(input) {
    await recordUsage({
        workspace_id: input.workspace_id,
        category: input.category,
        quantity: input.quantity,
        unit: input.unit,
        cost: input.cost,
        task_id: input.task_id,
    });
}
//# sourceMappingURL=billing-service.js.map