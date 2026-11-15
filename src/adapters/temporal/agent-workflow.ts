import { proxyActivities, defineQuery, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type { AgentRunInput, AgentRunResult } from './agent-activities.js';

const activities = proxyActivities<typeof import('./agent-activities.js')>({
  startToCloseTimeout: '5 minutes',
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
export const cancelSignal = defineSignal('cancel');
export const statusQuery = defineQuery<string>('status');

export async function kalizaAgentWorkflow(input: AgentRunInput): Promise<AgentRunResult> {
  let workflowStatus = 'RUNNING';
  let approvalDecision: string | null = null;
  let cancelled = false;

  setHandler(statusQuery, () => workflowStatus);
  setHandler(approvalDecisionSignal, (_id: string, decision: string) => { approvalDecision = decision; workflowStatus = `APPROVAL_${decision}`; });
  setHandler(userInputSignal, (inp: string) => { workflowStatus = 'INPUT_RECEIVED'; });
  setHandler(cancelSignal, () => { cancelled = true; workflowStatus = 'CANCELLING'; });

  if (cancelled) {
    workflowStatus = 'CANCELLED';
    return { task_id: input.task_id, agent_run_id: input.agent_run_id, status: 'CANCELLED', final_result: 'Cancelled before execution', tokens_used: 0 };
  }

  workflowStatus = 'EXECUTING';
  const result = await activities.runAgentWorkflowActivity(input);

  if (result.status === 'AWAITING_APPROVAL') {
    workflowStatus = 'AWAITING_APPROVAL';
    await condition(() => approvalDecision !== null || cancelled, '72 hours');
    if (cancelled) { workflowStatus = 'CANCELLED'; return { ...result, status: 'CANCELLED', final_result: 'Cancelled during approval' }; }
    if (approvalDecision === 'REJECTED') { workflowStatus = 'REJECTED'; return { ...result, status: 'REJECTED', final_result: 'Rejected by user' }; }
    workflowStatus = 'RESUMING';
    const resumed = await activities.resumeAgentWorkflowActivity({ task_id: input.task_id, workspace_id: input.workspace_id, agent_run_id: input.agent_run_id, thread_id: input.thread_id });
    workflowStatus = resumed.status;
    return resumed;
  }

  workflowStatus = result.status;
  return result;
}
