export interface DaytonaSandbox {
    id: string;
    status: string;
    image: string;
    resources: {
        cpu: number;
        memory: number;
        disk: number;
    };
    created_at: string;
}
export interface ExecuteCommandInput {
    sandboxId: string;
    command: string;
    timeout_ms?: number;
}
export interface ExecuteCommandResult {
    exit_code: number;
    stdout: string;
    stderr: string;
    duration_ms: number;
}
export interface ProvisionSandboxInput {
    image?: string;
    cpu?: number;
    memory?: number;
    disk?: number;
    env?: Record<string, string>;
}
export declare class DaytonaAdapter {
    private apiUrl;
    private apiKey;
    constructor();
    private get headers();
    private get isStub();
    provision(input: ProvisionSandboxInput): Promise<DaytonaSandbox>;
    execute(input: ExecuteCommandInput): Promise<ExecuteCommandResult>;
    pause(sandboxId: string): Promise<void>;
    resume(sandboxId: string): Promise<void>;
    terminate(sandboxId: string): Promise<void>;
    inspect(sandboxId: string): Promise<DaytonaSandbox>;
}
export declare function getDaytonaAdapter(): DaytonaAdapter;
//# sourceMappingURL=daytona-adapter.d.ts.map