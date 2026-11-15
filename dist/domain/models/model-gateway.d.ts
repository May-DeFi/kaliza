export interface ModelRequest {
    workspace_id: string;
    task_id?: string;
    agent_run_id?: string;
    task_type: string;
    prompt: string;
    system_prompt?: string;
    max_tokens?: number;
    temperature?: number;
}
export interface ModelResponse {
    content: string;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
    cost: number;
}
export declare function routeModel(taskType: string): {
    provider: string;
    model: string;
};
export declare function callModel(request: ModelRequest): Promise<ModelResponse>;
export declare function getModelUsage(workspaceId: string, limit?: number): Promise<Record<string, unknown>[]>;
//# sourceMappingURL=model-gateway.d.ts.map