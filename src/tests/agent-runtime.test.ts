import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAgentGraph } from '../adapters/langgraph/agent-runtime.js';

vi.mock('../domain/models/model-gateway.js', () => ({
  callModel: vi.fn().mockResolvedValue({ content: 'Mock model response', input_tokens: 10, output_tokens: 20, cost: 0.001 }),
}));

vi.mock('../domain/tasks/task-service.js', () => ({
  transitionTask: vi.fn().mockResolvedValue({}),
  getTask: vi.fn().mockResolvedValue({ id: 'test-task', workspace_id: 'ws-1', status: 'EXECUTING' }),
}));

vi.mock('../domain/tasks/sandbox-manager.js', () => ({
  provisionSandbox: vi.fn().mockResolvedValue({ id: 'sandbox-1', status: 'READY' }),
  executeInSandbox: vi.fn().mockResolvedValue({ exit_code: 0, stdout: 'OK', stderr: '', duration_ms: 10 }),
}));

vi.mock('../domain/tasks/sandbox-execution.js', () => ({
  runAgentScript: vi.fn().mockResolvedValue({ exit_code: 0, stdout: '{"status":"ok"}', stderr: '', duration_ms: 10 }),
  getWorkspaceScopedCredentials: vi.fn().mockResolvedValue({}),
  setSandboxEnvVar: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../domain/notifications/notification-service.js', () => ({
  notifyTaskEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../domain/audit/audit-service.js', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Agent Runtime Graph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should build a compiled graph', () => {
    const graph = buildAgentGraph();
    expect(graph).toBeDefined();
    expect(graph.invoke).toBeDefined();
  });

  it('should execute the full agent pipeline', async () => {
    const graph = buildAgentGraph();

    const initialState = {
      workspace_id: 'ws-test',
      task_id: 'task-test',
      agent_run_id: 'run-test',
      user_id: 'user-test',
      role: 'OWNER',
      objective: 'Create a social media content plan',
      service_id: 'business-growth',
      conversation_context: 'User wants weekly content',
      tool_allowlist: ['research_web', 'generate_content'],
      budget_limit_tokens: 50000,
    };

    const result = await graph.invoke(initialState, { recursionLimit: 25 });

    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.messages).toBeDefined();
    expect(result.final_result).toBeDefined();
  });
});
