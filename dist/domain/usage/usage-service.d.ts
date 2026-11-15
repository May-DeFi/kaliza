export interface UsageRecordInput {
    workspace_id: string;
    category: string;
    quantity: number;
    unit: string;
    cost?: number;
    task_id?: string;
    agent_run_id?: string;
}
export declare function recordUsage(input: UsageRecordInput): Promise<void>;
export declare function getWorkspaceUsageSummary(workspaceId: string): Promise<{
    total_cost: number;
    by_category: Record<string, {
        quantity: number;
        cost: number;
        unit: string;
    }>;
}>;
export declare function checkQuota(workspaceId: string, category: string, limit: number): Promise<{
    exceeded: boolean;
    current: number;
    limit: number;
}>;
//# sourceMappingURL=usage-service.d.ts.map