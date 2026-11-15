import { env, isPlaceholder } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { SandboxStatus, type SandboxStatusValue } from '../../config/constants.js';

export interface DaytonaSandbox {
  id: string;
  status: string;
  image: string;
  resources: { cpu: number; memory: number; disk: number };
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

export class DaytonaAdapter {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = env.daytona.apiUrl;
    this.apiKey = env.daytona.apiKey;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private get isStub(): boolean {
    return isPlaceholder(this.apiKey);
  }

  async provision(input: ProvisionSandboxInput): Promise<DaytonaSandbox> {
    if (this.isStub) {
      const stubId = `stub-sandbox-${crypto.randomUUID()}`;
      logger.warn('Daytona API key is placeholder — returning stub sandbox', { sandboxId: stubId });
      return {
        id: stubId,
        status: SandboxStatus.READY,
        image: input.image ?? 'ubuntu:22.04',
        resources: { cpu: input.cpu ?? 2, memory: input.memory ?? 4, disk: input.disk ?? 10 },
        created_at: new Date().toISOString(),
      };
    }

    const response = await fetch(`${this.apiUrl}/api/workspaces`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        image: input.image ?? 'ubuntu:22.04',
        resources: {
          cpu: input.cpu ?? 2,
          memory: input.memory ?? 4,
          disk: input.disk ?? 10,
        },
        env_vars: input.env ?? {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Daytona provision failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as DaytonaSandbox;
    return data;
  }

  async execute(input: ExecuteCommandInput): Promise<ExecuteCommandResult> {
    if (this.isStub || input.sandboxId.startsWith('stub-sandbox-')) {
      logger.warn('Daytona stub — returning fake command output', { sandboxId: input.sandboxId, command: input.command });
      return {
        exit_code: 0,
        stdout: `[STUB] Command executed: ${input.command}`,
        stderr: '',
        duration_ms: 10,
      };
    }

    const response = await fetch(`${this.apiUrl}/api/workspaces/${input.sandboxId}/execute`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        command: input.command,
        timeout: input.timeout_ms ?? 30000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Daytona execute failed: ${response.status} ${await response.text()}`);
    }

    return await response.json() as ExecuteCommandResult;
  }

  async pause(sandboxId: string): Promise<void> {
    if (this.isStub || sandboxId.startsWith('stub-sandbox-')) {
      logger.info('Daytona stub — simulated pause', { sandboxId });
      return;
    }
    const response = await fetch(`${this.apiUrl}/api/workspaces/${sandboxId}/pause`, {
      method: 'POST',
      headers: this.headers,
    });
    if (!response.ok) throw new Error(`Daytona pause failed: ${response.status}`);
  }

  async resume(sandboxId: string): Promise<void> {
    if (this.isStub || sandboxId.startsWith('stub-sandbox-')) {
      logger.info('Daytona stub — simulated resume', { sandboxId });
      return;
    }
    const response = await fetch(`${this.apiUrl}/api/workspaces/${sandboxId}/resume`, {
      method: 'POST',
      headers: this.headers,
    });
    if (!response.ok) throw new Error(`Daytona resume failed: ${response.status}`);
  }

  async terminate(sandboxId: string): Promise<void> {
    if (this.isStub || sandboxId.startsWith('stub-sandbox-')) {
      logger.info('Daytona stub — simulated terminate', { sandboxId });
      return;
    }
    const response = await fetch(`${this.apiUrl}/api/workspaces/${sandboxId}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    if (!response.ok) throw new Error(`Daytona terminate failed: ${response.status}`);
  }

  async inspect(sandboxId: string): Promise<DaytonaSandbox> {
    if (this.isStub || sandboxId.startsWith('stub-sandbox-')) {
      return {
        id: sandboxId,
        status: SandboxStatus.ACTIVE,
        image: 'ubuntu:22.04',
        resources: { cpu: 2, memory: 4, disk: 10 },
        created_at: new Date().toISOString(),
      };
    }
    const response = await fetch(`${this.apiUrl}/api/workspaces/${sandboxId}`, {
      headers: this.headers,
    });
    if (!response.ok) throw new Error(`Daytona inspect failed: ${response.status}`);
    return await response.json() as DaytonaSandbox;
  }
}

let adapter: DaytonaAdapter | null = null;

export function getDaytonaAdapter(): DaytonaAdapter {
  if (!adapter) adapter = new DaytonaAdapter();
  return adapter;
}
