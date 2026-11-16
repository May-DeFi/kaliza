import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ status: 'PAUSED', taskStatus: 'EXECUTING' }));

vi.mock('../adapters/database/supabase.js', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: { status: table === 'tasks' ? state.taskStatus : state.status },
          error: null,
        }),
      };
      return builder;
    },
  }),
}));

vi.mock('@temporalio/activity', () => ({
  Context: { current: () => ({ info: { activityId: 'activity-1', attempt: 1 } }) },
}));
vi.mock('../adapters/langgraph/agent-runtime.js', () => ({
  AgentRunCancelledError: class AgentRunCancelledError extends Error {
    constructor() {
      super('Agent run cancelled');
      this.name = 'AgentRunCancelledError';
    }
  },
  buildAgentGraphWithCheckpoint: vi.fn(),
}));
vi.mock('../domain/tasks/task-service.js', () => ({ transitionTask: vi.fn() }));
vi.mock('../domain/notifications/notification-service.js', () => ({ notifyTaskEvent: vi.fn() }));
vi.mock('../domain/audit/audit-service.js', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { waitForAgentRunControl } from '../adapters/temporal/agent-activities.js';

describe('Temporal activity execution checkpoints', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds execution while paused and continues only after the run is resumed', async () => {
    vi.useFakeTimers();
    state.status = 'PAUSED';
    state.taskStatus = 'EXECUTING';

    let completed = false;
    const waiting = waitForAgentRunControl('run-1', 'task-1').then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(completed).toBe(false);

    state.status = 'RUNNING';
    await vi.advanceTimersByTimeAsync(1000);
    await waiting;
    expect(completed).toBe(true);
  });

  it('aborts execution when the run is cancelled', async () => {
    state.status = 'CANCELLED';

    await expect(waitForAgentRunControl('run-1', 'task-1')).rejects.toMatchObject({ name: 'AgentRunCancelledError' });
  });

  it('aborts an active run when its task is cancelled', async () => {
    state.status = 'RUNNING';
    state.taskStatus = 'CANCELLED';

    await expect(waitForAgentRunControl('run-1', 'task-1')).rejects.toMatchObject({ name: 'AgentRunCancelledError' });
  });
});
