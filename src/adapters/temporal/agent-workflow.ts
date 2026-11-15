import { proxyActivities } from '@temporalio/workflow';
import { defineQuery, defineSignal, setHandler, condition, defineWorkflow } from '@temporalio/workflow';
import type { AgentRunInput, AgentRunResult } from '../temporal/agent-activities.js';

// Activity proxy — type-safe, non-blocking calls to the worker
const activities = proxyActivities<typeof import('../temporal/agent-activities.js')>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 2,
    maximumInterval: '30 seconds',
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['ApplicationFailure'],
  },
});

// ===== Query/Signal definitions for external control =====

export const approvalDecisionSignal = defineSignal<[string, string]>('approvalDecision');
export const userInputSignal = defineSignal<[string]>('userInput');
export const cancelSignal = defineSignal('cancel');
export const statusQuery = defineQuery<string>('status');

// ===== Workflow Definition =====

export const kalizaAgentWorkflow = defineWorkflow<typeof kalizaAgentWorkflowHandler>({
  name: 'kaliza-agent-workflow',
});

export async function kalizaAgentWorkflowHandler(input: AgentRunInput): Promise<AgentRunResult> {
  let workflowStatus = 'RUNNING';
  let approvalDecision: string | null = null;
  let userInput: string | null = null;
  let cancelled = false;

  setHandler(statusQuery, () => workflowStatus);

  setHandler(approvalDecisionSignal, (approvalId: string, decision: string) => {
    approvalDecision = decision;
    workflowStatus = `APPROVAL_${decision}`;
  });

  setHandler(userInputSignal, (input: string) => {
    userInput = input;
    workflowStatus = 'INPUT_RECEIVED';
  });

  setHandler(cancelSignal, () => {
    cancelled = true;
    workflowStatus = 'CANCELLING';
  });

  // Check for cancellation before starting
  if (cancelled) {
    workflowStatus = 'CANCELLED';
    return {
      task_id: input.task_id,
      agent_run_id: input.agent_run_id,
      status: 'CANCELLED',
      final_result: 'Workflow cancelled before execution',
      tokens_used: 0,
    };
  }

  // Run the agent workflow through the activity
  workflowStatus = 'EXECUTING';
  const result = await activities.runAgentWorkflowActivity(input);

  // If the workflow requires approval mid-execution, wait for the signal
  if (result.status === 'AWAITING_APPROVAL') {
    workflowStatus = 'AWAITING_APPROVAL';
    await condition(() => approvalDecision !== null || cancelled, '72 hours');

    if (cancelled) {
      workflowStatus = 'CANCELLED';
      return { ...result, status: 'CANCELLED', final_result: 'Cancelled during approval wait' };
    }

    if (approvalDecision === 'REJECTED') {
      workflowStatus = 'REJECTED';
      return { ...result, status: 'REJECTED', final_result: 'Action rejected by user' };
    }

    // Approved — resume
    workflowStatus = 'RESUMING';
    const resumed = await activities.resumeAgentWorkflowActivity({
      task_id: input.task_id,
      workspace_id: input.workspace_id,
      agent_run_id: input.agent_run_id,
      thread_id: input.thread_id,
      user_input: undefined,
    });
    workflowStatus = resumed.status;
    return resumed;
  }

  workflowStatus = result.status;
  return result;
}
