import type { SandboxInstance } from '../../contracts/types.js';
export declare function provisionSandbox(input: {
    workspace_id: string;
    task_id?: string;
    image?: string;
    resource_limits?: Record<string, unknown>;
}): Promise<SandboxInstance>;
export declare function getSandbox(id: string): Promise<SandboxInstance>;
export declare function executeInSandbox(input: {
    sandbox_id: string;
    command: string;
    timeout_ms?: number;
}): Promise<{
    exit_code: number;
    stdout: string;
    stderr: string;
    duration_ms: number;
}>;
export declare function pauseSandbox(sandboxId: string): Promise<SandboxInstance>;
export declare function resumeSandbox(sandboxId: string): Promise<SandboxInstance>;
export declare function terminateSandbox(sandboxId: string): Promise<void>;
export declare function listWorkspaceSandboxes(workspaceId: string): Promise<SandboxInstance[]>;
export declare function findIdleSandboxes(): Promise<SandboxInstance[]>;
export declare function findExpiredSandboxes(): Promise<SandboxInstance[]>;
export declare function reconcileSandboxLifecycles(): Promise<{
    paused: number;
    terminated: number;
}>;
//# sourceMappingURL=sandbox-manager.d.ts.map