export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    checks: {
        database: boolean;
        queue_depth: number;
    };
}
export declare function getSystemHealth(): Promise<SystemHealth>;
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
export declare function getPlatformMetrics(): Promise<PlatformMetrics>;
export declare function getCorrelationTrail(correlationId: string): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=observability.d.ts.map