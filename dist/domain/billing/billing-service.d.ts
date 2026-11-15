export declare function getPlanLimits(plan: string): {
    model_tokens: number;
    sandbox_hours: number;
    active_workflows: number;
    concurrency: number;
};
export declare function getOrCreateSubscription(workspaceId: string, plan?: string): Promise<any>;
export declare function getSubscription(workspaceId: string): Promise<any>;
export declare function upgradePlan(workspaceId: string, newPlan: string): Promise<any>;
export declare function checkEntitlement(workspaceId: string, category: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: string;
}>;
export declare function recordBillingCharge(input: {
    workspace_id: string;
    category: string;
    quantity: number;
    unit: string;
    cost: number;
    task_id?: string;
}): Promise<void>;
//# sourceMappingURL=billing-service.d.ts.map