import { proxyActivities, defineQuery, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type { AgentRunInput, AgentRunResult } from './agent-activities.js';

const activities = proxyActivities<typeof import('./agent-activities.js')>({
  startToCloseTimeout: '72 hours',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '30 seconds',
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['ApplicationFailure'],
  },
});

export const approvalDecisionSignal = defineSignal<[string, string]>('approvalDecision');
export const userInputSignal = defineSignal<[string]>('userInput');
export const pauseSignal = defineSignal('pause');
export const resumeSignal = defineSignal<[string]>('resume');
export const cancelSignal = defineSignal('cancel');
export const statusQuery = defineQuery<string>('status');

export async function kalizaAgentWorkflow(input: AgentRunInput): Promise<AgentRunResult> {
  let workflowStatus = 'RUNNING';
  let approvalDecision: string | null = null;
  let approvalDecisionId: string | null = null;
  let pendingApprovalId: string | null = input.approval_id ?? null;
  const earlyApprovalDecisions = new Map<string, string>();
  let cancelled = false;
  let paused = false;
  let userInput: string | null = null;
  let awaitingInput = false;

  const waitUntilResumed = async (): Promise<boolean> => {
    if (!paused) return !cancelled;
    workflowStatus = 'PAUSED';
    await condition(() => !paused || cancelled);
    return !cancelled;
  };

  setHandler(statusQuery, () => workflowStatus);
  setHandler(approvalDecisionSignal, (id: string, decision: string) => {
    const normalizedId = typeof id === 'string' ? id.trim() : '';
    const normalizedDecision = typeof decision === 'string' ? decision.trim().toUpperCase() : '';

    if (!normalizedId) return;
    if (normalizedDecision !== 'APPROVED' && normalizedDecision !== 'REJECTED' && normalizedDecision !== 'CHANGES_REQUESTED') return;
    if (!pendingApprovalId) {
      if (!earlyApprovalDecisions.has(normalizedId)) earlyApprovalDecisions.set(normalizedId, normalizedDecision);
      return;
    }
    if (normalizedId !== pendingApprovalId || approvalDecision !== null) return;
    approvalDecisionId = normalizedId;
    approvalDecision = normalizedDecision;
    workflowStatus = `APPROVAL_${normalizedDecision}`;
  });
  setHandler(userInputSignal, (nextInput: string) => {
    if (!awaitingInput || typeof nextInput !== 'string' || !nextInput.trim()) return;
    userInput = nextInput;
    workflowStatus = 'INPUT_RECEIVED';
  });
  setHandler(pauseSignal, () => {
    paused = true;
    workflowStatus = 'PAUSED';
  });
  setHandler(resumeSignal, (nextInput: string) => {
    if (typeof nextInput === 'string' && nextInput.trim()) userInput = nextInput;
    paused = false;
    if (!cancelled) workflowStatus = 'RESUMING';
  });
  setHandler(cancelSignal, () => {
    cancelled = true;
    workflowStatus = 'CANCELLING';
  });

  if (cancelled) {
    workflowStatus = 'CANCELLED';
    return { task_id: input.task_id, agent_run_id: input.agent_run_id, status: 'CANCELLED', final_result: 'Cancelled before execution', tokens_used: 0 };
  }

  if (!await waitUntilResumed()) {
    workflowStatus = 'CANCELLED';
    return { task_id: input.task_id, agent_run_id: input.agent_run_id, status: 'CANCELLED', final_result: 'Cancelled before execution', tokens_used: 0 };
  }

  workflowStatus = 'EXECUTING';
  const result = await activities.runAgentWorkflowActivity(input);
  if (cancelled || result.status === 'CANCELLED') {
    workflowStatus = 'CANCELLED';
    return { ...result, status: 'CANCELLED', final_result: 'Cancelled during execution' };
  }

  if (result.status === 'AWAITING_APPROVAL') {
    pendingApprovalId = result.approval_id ?? pendingApprovalId;
    if (pendingApprovalId) {
      const earlyDecision = earlyApprovalDecisions.get(pendingApprovalId);
      if (earlyDecision) {
        approvalDecisionId = pendingApprovalId;
        approvalDecision = earlyDecision;
      }
    }
    workflowStatus = 'AWAITING_APPROVAL';
    await condition(() => approvalDecision !== null || cancelled, '72 hours');
    if (cancelled) { workflowStatus = 'CANCELLED'; return { ...result, status: 'CANCELLED', final_result: 'Cancelled during approval' }; }
    if (approvalDecision === null) {
      workflowStatus = 'EXPIRED';
      return { ...result, status: 'EXPIRED', final_result: 'Approval expired before a valid decision was recorded' };
    }
    if (approvalDecision !== 'APPROVED') {
      workflowStatus = approvalDecision === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'REJECTED';
      return { ...result, status: approvalDecision === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'REJECTED', final_result: approvalDecision === 'CHANGES_REQUESTED' ? 'Changes requested by approver' : 'Rejected by user' };
    }
    if (!await waitUntilResumed()) {
      workflowStatus = 'CANCELLED';
      return { ...result, status: 'CANCELLED', final_result: 'Cancelled before resuming after approval' };
    }
    workflowStatus = 'RESUMING';
    const resumed = await activities.resumeAgentWorkflowActivity({
      task_id: input.task_id,
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      agent_run_id: input.agent_run_id,
      thread_id: input.thread_id,
      user_input: userInput ?? undefined,
    });
    if (cancelled || resumed.status === 'CANCELLED') {
      workflowStatus = 'CANCELLED';
      return { ...resumed, status: 'CANCELLED', final_result: 'Cancelled during resumed execution' };
    }
    workflowStatus = resumed.status;
    return resumed;
  }

  if (result.status === 'AWAITING_INPUT') {
    awaitingInput = true;
    workflowStatus = 'AWAITING_INPUT';
    await condition(() => userInput !== null || cancelled, '24 hours');
    awaitingInput = false;
    if (cancelled) { workflowStatus = 'CANCELLED'; return { ...result, status: 'CANCELLED', final_result: 'Cancelled while awaiting input' }; }
    if (userInput === null) {
      workflowStatus = 'EXPIRED';
      return { ...result, status: 'EXPIRED', final_result: 'Waiting for input expired' };
    }
    if (!await waitUntilResumed()) {
      workflowStatus = 'CANCELLED';
      return { ...result, status: 'CANCELLED', final_result: 'Cancelled before resuming after input' };
    }
    workflowStatus = 'RESUMING';
    const resumed = await activities.resumeAgentWorkflowActivity({
      task_id: input.task_id,
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      agent_run_id: input.agent_run_id,
      thread_id: input.thread_id,
      user_input: userInput,
    });
    if (cancelled || resumed.status === 'CANCELLED') {
      workflowStatus = 'CANCELLED';
      return { ...resumed, status: 'CANCELLED', final_result: 'Cancelled during resumed execution' };
    }
    workflowStatus = resumed.status;
    return resumed;
  }

  if (!await waitUntilResumed()) {
    workflowStatus = 'CANCELLED';
    return { ...result, status: 'CANCELLED', final_result: 'Cancelled before workflow completion' };
  }
  workflowStatus = result.status;
  return result;
}
