import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { logger } from '../../config/logger.js';

export interface UsageRecordInput {
  workspace_id: string;
  category: string;
  quantity: number;
  unit: string;
  cost?: number;
  task_id?: string;
  agent_run_id?: string;
}

export async function recordUsage(input: UsageRecordInput): Promise<void> {
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

export async function getWorkspaceUsageSummary(workspaceId: string): Promise<{
  total_cost: number;
  by_category: Record<string, { quantity: number; cost: number; unit: string }>;
}> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('usage_events')
    .select('category, quantity, unit, cost')
    .eq('workspace_id', workspaceId);

  if (error) throw error;

  const byCategory: Record<string, { quantity: number; cost: number; unit: string }> = {};
  let totalCost = 0;

  for (const event of data ?? []) {
    const cat = event.category as string;
    if (!byCategory[cat]) {
      byCategory[cat] = { quantity: 0, cost: 0, unit: event.unit as string };
    }
    byCategory[cat].quantity += Number(event.quantity);
    byCategory[cat].cost += Number(event.cost);
    totalCost += Number(event.cost);
  }

  return { total_cost: Number(totalCost.toFixed(6)), by_category: byCategory };
}

export async function checkQuota(workspaceId: string, category: string, limit: number): Promise<{
  exceeded: boolean;
  current: number;
  limit: number;
}> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('usage_events')
    .select('quantity')
    .eq('workspace_id', workspaceId)
    .eq('category', category);

  if (error) throw error;

  const current = (data ?? []).reduce((sum, e) => sum + Number(e.quantity), 0);
  return { exceeded: current >= limit, current, limit };
}
