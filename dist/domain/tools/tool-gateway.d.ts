import type { ToolInvocation } from '../../contracts/types.js';
import type { Approval } from '../../contracts/types.js';
export interface ToolDefinition {
    tool_id: string;
    version: string;
    description: string | null;
    input_schema: Record<string, unknown>;
    output_schema: Record<string, unknown>;
    connector: string | null;
    required_scopes: string[];
    required_entitlements: string[];
    risk: string;
    approval_policy: Record<string, unknown>;
    timeout_ms: number;
    execution_environment: string;
    usage_category: string | null;
    available: boolean;
}
export declare function getToolDefinition(toolId: string): Promise<ToolDefinition>;
export declare function listTools(): Promise<ToolDefinition[]>;
export declare function registerTool(input: {
    tool_id: string;
    version?: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    connector?: string;
    required_scopes?: string[];
    required_entitlements?: string[];
    risk?: string;
    execution_environment?: string;
    timeout_ms?: number;
    usage_category?: string;
}): Promise<ToolDefinition>;
export interface ToolExecutionContext {
    workspace_id: string;
    user_id: string;
    role: string;
    task_id?: string;
    agent_run_id?: string;
    tool_id: string;
    action: string;
    input: Record<string, unknown>;
    approval?: Approval | null;
}
export declare function authorizeToolExecution(ctx: ToolExecutionContext): Promise<{
    allowed: boolean;
    reason: string;
    policy_version: string;
    risk: string;
}>;
export declare function recordToolInvocation(input: {
    task_id?: string;
    agent_run_id?: string;
    workspace_id: string;
    tool_id: string;
    tool_version: string;
    input: Record<string, unknown>;
    output_ref?: string;
    status: string;
    duration_ms?: number;
    error_message?: string;
}): Promise<ToolInvocation>;
export declare function listToolInvocations(workspaceId: string, taskId?: string): Promise<ToolInvocation[]>;
//# sourceMappingURL=tool-gateway.d.ts.map