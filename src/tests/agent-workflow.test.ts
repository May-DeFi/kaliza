import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: string[]) => unknown>(),
  waiters: new Set<() => void>(),
  runActivity: vi.fn(),
  resumeActivity: vi.fn(),
}));

vi.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({
    runAgentWorkflowActivity: state.runActivity,
    resumeAgentWorkflowActivity: state.resumeActivity,
  }),
  defineSignal: (name: string) => name,
  defineQuery: (name: string) => name,
  setHandler: (name: string, handler: (...args: string[]) => unknown) => {
    state.handlers.set(name, (...args) => {
      const result = handler(...args);
      for (const wake of state.waiters) wake();
      state.waiters.clear();
      return result;
    });
  },
  condition: async (predicate: () => boolean) => {
    while (!predicate()) {
      await new Promise<void>((resolve) => state.waiters.add(resolve));
    }
  },
}));

import { kalizaAgentWorkflow } from '../adapters/temporal/agent-workflow.js';

const workflowInput = {
  task_id: 'task-1',
  workspace_id: 'workspace-1',
  user_id: 'user-1',
  role: 'OWNER',
  objective: 'Publish an approved post',
  service_id: 'business-growth',
  conversation_context: '',
  tool_allowlist: [],
  budget_limit_tokens: 1000,
  agent_run_id: 'run-1',
  thread_id: 'thread-1',
};

function signal(name: string, ...args: string[]): void {
  const handler = state.handlers.get(name);
  if (!handler) throw new Error(`Signal handler ${name} is not registered`);
  handler(...args);
}

async function waitForStatus(expectedStatus: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (state.handlers.has('status')) {
      // The workflow status is observed through its registered query handler.
      const currentStatus = state.handlers.get('status')?.();
      if (currentStatus === expectedStatus) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Workflow did not reach ${expectedStatus}`);
}

describe('Temporal agent workflow wait and cancellation behavior', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.waiters.clear();
    state.runActivity.mockReset();
    state.resumeActivity.mockReset();
  });

  it('does not continue approval wait for pause or a mismatched decision', async () => {
    state.runActivity.mockResolvedValue({
      task_id: 'task-1',
      agent_run_id: 'run-1',
      status: 'AWAITING_APPROVAL',
      approval_id: 'approval-1',
      final_result: '',
      tokens_used: 0,
    });
    state.resumeActivity.mockResolvedValue({
      task_id: 'task-1',
      agent_run_id: 'run-1',
      status: 'COMPLETED',
      final_result: 'done',
      tokens_used: 1,
    });

    const execution = kalizaAgentWorkflow(workflowInput);
    await waitForStatus('AWAITING_APPROVAL');
    signal('pause');
    signal('approvalDecision', 'other-approval', 'APPROVED');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.resumeActivity).not.toHaveBeenCalled();

    signal('approvalDecision', 'approval-1', 'APPROVED');
    signal('approvalDecision', 'approval-1', 'REJECTED');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.resumeActivity).not.toHaveBeenCalled();

    signal('resume', '');
    await expect(execution).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(state.resumeActivity).toHaveBeenCalledTimes(1);
  });

  it('correlates an early approval signal only after the activity identifies its approval', async () => {
    let finishActivity!: (result: Record<string, unknown>) => void;
    state.runActivity.mockImplementation(() => new Promise((resolve) => {
      finishActivity = resolve;
    }));
    state.resumeActivity.mockResolvedValue({
      task_id: 'task-1',
      agent_run_id: 'run-1',
      status: 'COMPLETED',
      final_result: 'done',
      tokens_used: 1,
    });

    const execution = kalizaAgentWorkflow(workflowInput);
    await waitForStatus('EXECUTING');
    signal('approvalDecision', 'wrong-approval', 'APPROVED');
    finishActivity({
      task_id: 'task-1',
      agent_run_id: 'run-1',
      status: 'AWAITING_APPROVAL',
      approval_id: 'approval-1',
      final_result: '',
      tokens_used: 0,
    });

    await waitForStatus('AWAITING_APPROVAL');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.resumeActivity).not.toHaveBeenCalled();

    signal('approvalDecision', 'approval-1', 'APPROVED');
    await expect(execution).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(state.resumeActivity).toHaveBeenCalledTimes(1);
  });

  it('does not continue input wait for pause and resumes with retained input', async () => {
    state.runActivity.mockResolvedValue({
      task_id: 'task-1',
      agent_run_id: 'run-1',
      status: 'AWAITING_INPUT',
      final_result: '',
      tokens_used: 0,
    });
    state.resumeActivity.mockResolvedValue({
      task_id: 'task-1',
      agent_run_id: 'run-1',
      status: 'COMPLETED',
      final_result: 'done',
      tokens_used: 1,
    });

    const execution = kalizaAgentWorkflow(workflowInput);
    await waitForStatus('AWAITING_INPUT');
    signal('pause');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.resumeActivity).not.toHaveBeenCalled();

    signal('userInput', 'make it more concise');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.resumeActivity).not.toHaveBeenCalled();

    signal('resume', '');
    await expect(execution).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(state.resumeActivity).toHaveBeenCalledWith(expect.objectContaining({ user_input: 'make it more concise' }));
  });

  it('cancellation while execution is in flight prevents approval resumption', async () => {
    let finishActivity!: (result: Record<string, unknown>) => void;
    state.runActivity.mockImplementation(() => new Promise((resolve) => {
      finishActivity = resolve;
    }));

    const execution = kalizaAgentWorkflow(workflowInput);
    await waitForStatus('EXECUTING');
    signal('cancel');
    finishActivity({
      task_id: 'task-1',
      agent_run_id: 'run-1',
      status: 'AWAITING_APPROVAL',
      approval_id: 'approval-1',
      final_result: '',
      tokens_used: 0,
    });

    await expect(execution).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(state.resumeActivity).not.toHaveBeenCalled();
  });
});
