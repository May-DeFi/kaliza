import type {
  AgentOrchestrator,
  CreateRunInput,
  RunReference,
  ResumeRunInput,
  PauseRunInput,
  CancelRunInput,
  GetRunInput,
  StreamRunInput,
  RunSnapshot,
  RunEvent,
} from '../../domain/agents/orchestrator.js';
import { AgentRunStatus, type AgentRunStatusValue } from '../../config/constants.js';
import { getTemporalClient, getTaskQueue } from '../temporal/temporal-client.js';
import { kalizaAgentWorkflow } from '../temporal/agent-workflow.js';
import { logger } from '../../config/logger.js';

export class TemporalLangGraphOrchestrator implements AgentOrchestrator {
  async createRun(input: CreateRunInput): Promise<RunReference> {
    const client = await getTemporalClient();
    const taskQueue = getTaskQueue();
    const threadId = `kaliza-thread-${input.task_id}`;
    const workflowId = `kaliza-task-${input.task_id}`;

    const agentRunInput = {
      task_id: input.task_id,
      workspace_id: input.workspace_id,
      user_id: input.workspace_id,
      role: 'OWNER',
      objective: input.objective,
      service_id: input.service_id,
      conversation_context: input.context_references?.join('\n') ?? '',
      tool_allowlist: input.tool_allowlist ?? [],
      budget_limit_tokens: input.budget_limit_tokens ?? 50000,
      agent_run_id: workflowId,
      thread_id: threadId,
    };

    const handle = await client.workflow.start(kalizaAgentWorkflow, {
      workflowId,
      taskQueue,
      args: [agentRunInput],
      workflowExecutionTimeout: '24 hours',
      workflowRunTimeout: '2 hours',
    });

    logger.info('Temporal workflow started', { workflowId, taskId: input.task_id, threadId });
    return { run_id: handle.workflowId, task_id: input.task_id, status: AgentRunStatus.RUNNING };
  }

  async resumeRun(input: ResumeRunInput): Promise<RunReference> {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(input.run_id);
    if (input.approved_action) await handle.signal('approvalDecision', input.run_id, 'APPROVED');
    if (input.user_input) await handle.signal('userInput', input.user_input);
    logger.info('Workflow resumed', { runId: input.run_id, taskId: input.task_id });
    return { run_id: input.run_id, task_id: input.task_id, status: AgentRunStatus.RUNNING };
  }

  async pauseRun(input: PauseRunInput): Promise<void> {
    logger.info('Workflow pause requested', { runId: input.run_id, taskId: input.task_id });
  }

  async cancelRun(input: CancelRunInput): Promise<void> {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(input.run_id);
    await handle.cancel();
    logger.info('Workflow cancelled', { runId: input.run_id, taskId: input.task_id });
  }

  async getRun(input: GetRunInput): Promise<RunSnapshot> {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(input.run_id);
    const status = await handle.query<string>('status');
    const info = await handle.describe();
    return {
      run_id: input.run_id,
      task_id: info.workflowId,
      status: this.mapStatus(status),
      current_step: status,
    };
  }

  async *streamEvents(input: StreamRunInput): AsyncIterable<RunEvent> {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(input.run_id);
    yield { type: 'run.started', run_id: input.run_id, task_id: input.run_id, timestamp: new Date().toISOString() };
    let done = false;
    while (!done) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await handle.query<string>('status').catch(() => 'UNKNOWN');
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) done = true;
      yield { type: 'run.progress', run_id: input.run_id, task_id: input.run_id, timestamp: new Date().toISOString(), data: { status } };
    }
    yield { type: 'run.completed', run_id: input.run_id, task_id: input.run_id, timestamp: new Date().toISOString() };
  }

  private mapStatus(status: string): AgentRunStatusValue {
    if (status === 'COMPLETED') return AgentRunStatus.COMPLETED;
    if (status === 'FAILED') return AgentRunStatus.FAILED;
    if (status === 'CANCELLED' || status === 'CANCELLING') return AgentRunStatus.CANCELLED;
    if (status === 'AWAITING_APPROVAL') return AgentRunStatus.AWAITING_APPROVAL;
    if (status === 'AWAITING_INPUT' || status === 'INPUT_RECEIVED') return AgentRunStatus.AWAITING_INPUT;
    return AgentRunStatus.RUNNING;
  }
}
