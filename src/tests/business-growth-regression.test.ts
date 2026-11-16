import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTask: vi.fn(),
  createTask: vi.fn(),
  transitionTask: vi.fn(),
  createAgentRun: vi.fn(),
  notifyTaskEvent: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('../domain/tasks/task-service.js', () => ({
  createTask: mocks.createTask,
  getTask: mocks.getTask,
  transitionTask: mocks.transitionTask,
}));

vi.mock('../domain/agents/agent-run-service.js', () => ({
  createAgentRun: mocks.createAgentRun,
}));

vi.mock('../domain/notifications/notification-service.js', () => ({
  notifyTaskEvent: mocks.notifyTaskEvent,
}));

vi.mock('../domain/audit/audit-service.js', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock('../domain/usage/usage-service.js', () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../domain/models/model-gateway.js', () => ({
  callModel: vi.fn().mockResolvedValue({ content: 'ok', input_tokens: 1, output_tokens: 1, cost: 0.01 }),
}));

vi.mock('../domain/policies/policy-engine.js', () => ({
  evaluatePolicy: vi.fn(() => ({ approval_required: false, risk_class: 'LOW', decision: 'ALLOW' })),
  computeActionHash: vi.fn(() => 'hash-1'),
  hasPayloadChanged: vi.fn(() => false),
}));

vi.mock('../adapters/database/supabase.js', () => ({
  getSupabaseAdminClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'approval-1', task_id: 'task-1', workspace_id: 'ws-1', action_hash: 'hash-1', action_version: 1, risk: 'MODERATE', payload: { action: 'publish' }, decision: 'PENDING', expiry: new Date(Date.now() + 3600000).toISOString() }, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: 'approval-1', task_id: 'task-1', workspace_id: 'ws-1', action_hash: 'hash-1', action_version: 1, risk: 'MODERATE', payload: { action: 'publish' }, decision: 'APPROVED', approver_id: 'user-1', decided_at: new Date().toISOString(), expiry: new Date(Date.now() + 3600000).toISOString() }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'approval-1', task_id: 'task-1', workspace_id: 'ws-1', action_hash: 'hash-1', action_version: 1, risk: 'MODERATE', payload: { action: 'publish' }, decision: 'APPROVED', approver_id: 'user-1', decided_at: new Date().toISOString(), expiry: new Date(Date.now() + 3600000).toISOString() }, error: null }),
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'approval-1', task_id: 'task-1', workspace_id: 'ws-1', action_hash: 'hash-1', action_version: 1, risk: 'MODERATE', payload: { action: 'publish' }, decision: 'APPROVED', approver_id: 'user-1', decided_at: new Date().toISOString(), expiry: new Date(Date.now() + 3600000).toISOString() }, error: null }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'approval-1', task_id: 'task-1', workspace_id: 'ws-1', action_hash: 'hash-1', action_version: 1, risk: 'MODERATE', payload: { action: 'publish' }, decision: 'PENDING', expiry: new Date(Date.now() + 3600000).toISOString() }, error: null }),
        })),
      })),
    })),
  }),
}));

vi.mock('../adapters/temporal/temporal-client.js', () => ({
  isTemporalConfigured: vi.fn(() => false),
  getTemporalClient: vi.fn(),
}));

vi.mock('../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { startBusinessGrowthTask } from '../services/business-growth/index.js';
import { decideApproval } from '../domain/approvals/approval-service.js';

describe('Business growth task safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTask.mockResolvedValue({ id: 'task-1', status: 'RECEIVED' });
    mocks.getTask.mockResolvedValue({ id: 'task-1', workspace_id: 'ws-1', status: 'RECEIVED' });
    mocks.createAgentRun.mockResolvedValue({ agentRun: { id: 'run-1' }, runReference: { run_id: 'run-1', task_id: 'task-1', status: 'RUNNING' } });
    mocks.transitionTask.mockResolvedValue({ id: 'task-1' });
  });

  it('reuses a task id when one is already attached to the business growth flow', async () => {
    const result = await startBusinessGrowthTask({
      workspace_id: 'ws-1',
      user_id: 'user-1',
      conversation_id: '11111111-1111-4111-8111-111111111111',
      objective: 'Create a social plan',
      task_id: 'task-1',
    });

    expect(mocks.getTask).toHaveBeenCalledWith('task-1');
    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(result.task_id).toBe('task-1');
  });

  it('rejects approvals for the wrong workspace', async () => {
    await expect(
      decideApproval({ approval_id: 'approval-1', decision: 'APPROVED', approver_id: 'user-2', workspace_id: 'ws-2' }),
    ).rejects.toThrow('workspace');
  });
});
