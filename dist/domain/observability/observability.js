import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { getQueueDepth } from '../../adapters/queue/job-queue.js';
export async function getSystemHealth() {
    let dbHealthy = false;
    try {
        const supabase = getSupabaseAdminClient();
        const { error } = await supabase.from('service_registry').select('id').limit(1);
        dbHealthy = !error;
    }
    catch {
        dbHealthy = false;
    }
    let queueDepth = 0;
    try {
        queueDepth = await getQueueDepth();
    }
    catch {
        queueDepth = -1;
    }
    const status = dbHealthy ? 'healthy' : 'unhealthy';
    return {
        status,
        timestamp: new Date().toISOString(),
        checks: {
            database: dbHealthy,
            queue_depth: queueDepth,
        },
    };
}
export async function getPlatformMetrics() {
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
    const tasksByStatus = {};
    for (const row of statusData ?? []) {
        const s = row.status;
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
    const totalCost = (costData ?? []).reduce((sum, e) => sum + Number(e.cost), 0);
    let queueDepth = 0;
    try {
        queueDepth = await getQueueDepth();
    }
    catch {
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
export async function getCorrelationTrail(correlationId) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .eq('correlation_id', correlationId)
        .order('created_at', { ascending: true });
    if (error)
        throw error;
    return (data ?? []);
}
//# sourceMappingURL=observability.js.map