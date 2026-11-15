import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { getQueueDepth } from '../../adapters/queue/job-queue.js';
import { logger } from '../../config/logger.js';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: boolean;
    queue_depth: number;
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  let dbHealthy = false;
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('service_registry').select('id').limit(1);
    dbHealthy = !error;
  } catch {
    dbHealthy = false;
  }

  let queueDepth = 0;
  try {
    queueDepth = await getQueueDepth();
  } catch {
    queueDepth = -1;
  }

  const status: SystemHealth['status'] = dbHealthy ? 'healthy' : 'unhealthy';

  return {
    status,
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy,
      queue_depth: queueDepth,
    },
  };
}

export interface PlatformMetrics {
  total_workspaces: number;
  total_users: number;
  total_tasks: number;
  tasks_by_status: Record<string, number>;
  active_sandboxes: number;
  pending_approvals: number;
  queue_depth: number;
  total_model_usage_cost: number;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const supabase = getSupabaseAdminClient();

  const [{ count: wsCount }, { count: userCount }, { count: taskCount }] = await Promise.all([
    supabase.from('workspaces').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('tasks').select('*', { count: 'exact', head: true }),
  ]);

  const { data: statusData } = await supabase
    .from('tasks')
    .select('status')
    .order('created_at', { ascending: false })
    .limit(1000);

  const tasksByStatus: Record<string, number> = {};
  for (const row of statusData ?? []) {
    const s = (row as { status: string }).status;
    tasksByStatus[s] = (tasksByStatus[s] ?? 0) + 1;
  }

  const { count: sandboxCount } = await supabase
    .from('sandbox_instances')
    .select('*', { count: 'exact', head: true })
    .in('status', ['READY', 'ACTIVE']);

  const { count: approvalCount } = await supabase
    .from('approvals')
    .select('*', { count: 'exact', head: true })
    .eq('decision', 'PENDING');

  const { data: costData } = await supabase
    .from('model_usage')
    .select('cost');

  const totalCost = (costData ?? []).reduce((sum, e) => sum + Number((e as { cost: number }).cost), 0);

  let queueDepth = 0;
  try {
    queueDepth = await getQueueDepth();
  } catch {
    // queue may not be accessible
  }

  return {
    total_workspaces: wsCount ?? 0,
    total_users: userCount ?? 0,
    total_tasks: taskCount ?? 0,
    tasks_by_status: tasksByStatus,
    active_sandboxes: sandboxCount ?? 0,
    pending_approvals: approvalCount ?? 0,
    queue_depth: queueDepth,
    total_model_usage_cost: Number(totalCost.toFixed(6)),
  };
}

export async function getCorrelationTrail(correlationId: string): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .eq('correlation_id', correlationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}
