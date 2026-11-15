export declare const SERVICE_ID: "business-growth";
export declare const CAPABILITIES: {
    readonly ONLINE_PRESENCE: "online_presence";
    readonly ADVERTISING: "advertising_management";
    readonly PROSPECT_DISCOVERY: "prospect_discovery";
    readonly SALES_OPERATIONS: "sales_operations";
    readonly WORKFLOW_AUTOMATION: "workflow_automation";
    readonly ANALYTICS: "analytics";
};
export declare const WORKFLOW_DEFINITIONS: ({
    definition_id: string;
    version: number;
    name: string;
    capability: "online_presence";
    steps: string[];
    approval_points: string[];
} | {
    definition_id: string;
    version: number;
    name: string;
    capability: "advertising_management";
    steps: string[];
    approval_points: string[];
} | {
    definition_id: string;
    version: number;
    name: string;
    capability: "prospect_discovery";
    steps: string[];
    approval_points: string[];
} | {
    definition_id: string;
    version: number;
    name: string;
    capability: "sales_operations";
    steps: string[];
    approval_points: never[];
} | {
    definition_id: string;
    version: number;
    name: string;
    capability: "workflow_automation";
    steps: string[];
    approval_points: string[];
} | {
    definition_id: string;
    version: number;
    name: string;
    capability: "analytics";
    steps: string[];
    approval_points: never[];
})[];
export interface BusinessGrowthTaskInput {
    workspace_id: string;
    user_id: string;
    conversation_id?: string;
    objective: string;
    capability?: string;
}
export declare function startBusinessGrowthTask(input: BusinessGrowthTaskInput): Promise<{
    task_id: string;
    agent_run_id: string;
    status: string;
}>;
export declare function classifyObjective(objective: string): Promise<{
    capability: string;
    workflow_id: string;
}>;
export declare function generateContentPlan(input: {
    workspace_id: string;
    task_id: string;
    user_id: string;
    brandContext: string;
}): Promise<string>;
export declare function requestApprovalForAction(input: {
    workspace_id: string;
    task_id: string;
    user_id: string;
    action: string;
    payload: Record<string, unknown>;
}): Promise<string>;
export declare function completeBusinessGrowthTask(input: {
    task_id: string;
    workspace_id: string;
    user_id: string;
    result: string;
}): Promise<void>;
//# sourceMappingURL=index.d.ts.map