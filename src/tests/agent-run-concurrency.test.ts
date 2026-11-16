import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  createRun: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  cancelRun: vi.fn(),
}));

vi.mock('../adapters/database/supabase.js', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      let mode: 'select' | 'insert' | 'update' = 'select';
      let filters: Record<string, unknown> = {};
      let insertValues: Record<string, unknown> | null = null;
      let updateValues: Record<string, unknown> | null = null;
      const builder: any = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        in: (key: string, value: unknown[]) => {
          filters[key] = value;
          return builder;
        },
        order: () => builder,
        insert: (values: Record<string, unknown>) => {
          mode = 'insert';
          insertValues = values;
          return builder;
        },
        update: (values: Record<string, unknown>) => {
          mode = 'update';
          updateValues = values;
          return builder;
        },
        single: async () => execute(true),
        maybeSingle: async () => execute(true),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => execute(false).then(resolve, reject),
      };
      const execute = async (single: boolean) => {
        if (table === 'tasks') return { data: { id: 'task-1', workspace_id: 'workspace-1', user_id: 'user-1' }, error: null };
        if (table !== 'agent_runs') return { data: null, error: null };
        if (mode === 'insert' && insertValues) {
          const activeStatuses = ['CREATED', 'RUNNING', 'PAUSED', 'AWAITING_APPROVAL', 'AWAITING_INPUT'];
          const existingActive = state.rows.some((row) =>
            row.task_id === insertValues?.task_id && activeStatuses.includes(String(row.status)),
          );
          if (existingActive) return { data: null, error: { code: '23505', message: 'unique active run per task' } };

          const row = {
            id: `run-${state.rows.length + 1}`,
            ...insertValues,
            external_run_id: null,
            created_at: new Date().toISOString(),
          };
          state.rows.push(row);
          return { data: row, error: null };
        }

        if (mode === 'update') {
          const matching = state.rows.filter((row) =>
            Object.entries(filters).every(([key, value]) => {
              if (Array.isArray(value)) return value.includes(row[key]);
              return row[key] === value;
            }),
          );
          for (const row of matching) Object.assign(row, updateValues);
          return { data: single ? matching[0] ?? null : matching, error: null };
        }
        const matching = state.rows.filter((row) =>
          (!filters.id || row.id === filters.id)
          && (!filters.task_id || row.task_id === filters.task_id)
          && (!filters.status || (filters.status as string[]).includes(String(row.status))),
        );
        if (single) return { data: matching[0] ?? null, error: null };
        return { data: matching, error: null };
      };
      return builder;
    },
  }),
}));

vi.mock('../domain/tenancy/workspace-service.js', () => ({
  getMembership: vi.fn(async () => ({ role: 'OWNER' })),
}));

vi.mock('../adapters/orchestration/stub-orchestrator.js', () => ({
  getOrchestrator: () => ({
    createRun: state.createRun,
    pauseRun: state.pauseRun,
    resumeRun: state.resumeRun,
    cancelRun: state.cancelRun,
  }),
  setOrchestrator: vi.fn(),
}));

vi.mock('../adapters/temporal/temporal-client.js', () => ({
  isTemporalConfigured: vi.fn(() => false),
}));

vi.mock('../adapters/orchestration/temporal-orchestrator.js', () => ({
  TemporalLangGraphOrchestrator: vi.fn(),
}));

vi.mock('../config/env.js', () => ({
  env: { runtime: { mode: 'test' } },
}));

vi.mock('../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createAgentRun, pauseAgentRun, resumeAgentRun } from '../domain/agents/agent-run-service.js';

describe('Agent run active-run uniqueness', () => {
  beforeEach(() => {
    state.rows.length = 0;
    state.createRun.mockReset();
    state.pauseRun.mockReset();
    state.resumeRun.mockReset();
    state.cancelRun.mockReset();
    state.createRun.mockResolvedValue({
      run_id: 'workflow-1',
      task_id: 'task-1',
      status: 'RUNNING',
    });
    state.pauseRun.mockResolvedValue(undefined);
    state.resumeRun.mockResolvedValue({ run_id: 'workflow-1', task_id: 'task-1', status: 'RUNNING' });
  });

  it('allows only one run to be inserted for concurrent requests on the same task', async () => {
    const input = {
      task_id: 'task-1',
      workspace_id: 'workspace-1',
      user_id: 'user-1',
      service_id: 'business-growth',
      objective: 'Create a content plan',
    };

    const results = await Promise.all([createAgentRun(input), createAgentRun(input)]);

    expect(state.rows.filter((row) => row.status === 'CREATED' || row.status === 'RUNNING')).toHaveLength(1);
    expect(state.createRun).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((result) => result.agentRun.id)).size).toBe(1);
  });

  it('resumes a paused approval wait without changing it into an authorization', async () => {
    state.rows.push({
      id: 'run-approval',
      task_id: 'task-1',
      status: 'AWAITING_APPROVAL',
      external_run_id: 'workflow-approval',
      trace_metadata: {},
    });

    await pauseAgentRun('run-approval');
    expect(state.rows[0].status).toBe('PAUSED');

    const resumed = await resumeAgentRun('run-approval');
    expect(resumed.status).toBe('AWAITING_APPROVAL');
    expect(state.resumeRun).toHaveBeenCalledWith({
      run_id: 'workflow-approval',
      task_id: 'task-1',
      user_input: undefined,
    });
  });

  it('does not allow user input to replace a paused approval decision', async () => {
    state.rows.push({
      id: 'run-approval',
      task_id: 'task-1',
      status: 'AWAITING_APPROVAL',
      external_run_id: 'workflow-approval',
      trace_metadata: {},
    });
    await pauseAgentRun('run-approval');

    await expect(resumeAgentRun('run-approval', 'approve it')).rejects.toThrow('cannot replace a pending approval');
    expect(state.resumeRun).not.toHaveBeenCalled();
  });
});
