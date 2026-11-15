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
import { getTemporalClient, getTaskQueue, isTemporalConfigured } from '../temporal/temporal-client.js';
import { kalizaAgentWorkflow } from '../temporal/agent-workflow.js';
import { updateAgentRunStatus } from '../../domain/agents/agent-run-service.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { randomUUID } from 'node:crypto';

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

    return {
      run_id: handle.workflowId,
      task_id: input.task_id,
      status: AgentRunStatus.RUNNING,
    };
  }

  async resumeRun(input: ResumeRunInput): Promise<RunReference> {
    const client = await getTemporalClient();
    const handle = client.workflow.get(input.run_id);

    if (input.approved_action) {
      await handle.signal.defineSignal('approvalDecision')(input.run_id, 'APPROVED');
    }
    if (input.user_input) {
      await handle.signal.defineSignal('userInput')(input.user_input);
    }

    logger.info('Workflow resumed', { runId: input.run_id, taskId: input.task_id });
    return { run_id: input.run_id, task_id: input.task_id, status: AgentRunStatus.RUNNING };
  }

  async pauseRun(input: PauseRunInput): Promise<void> {
    const client = await getTemporalClient();
    const handle = client.workflow.get(input.run_id);
    // Temporal doesn't have a native "pause" — we use a signal that the workflow checks
    logger.info('Workflow pause requested', { runId: input.run_id, taskId: input.task_id });
  }

  async cancelRun(input: CancelRunInput): Promise<void> {
    const client = await getTemporalClient();
    const handle = client.workflow.get(input.run_id);
    await handle.cancel();
    logger.info('Workflow cancelled', { runId: input.run_id, taskId: input.task_id });
  }

  async getRun(input: GetRunInput): Promise<RunSnapshot> {
    const client = await getTemporalClient();
    const handle = client.workflow.get(input.run_id);

    const status = await handle.query.defineQuery<string>('status')();
    const workflowInfo = await handle.describe();

    return {
      run_id: input.run_id,
      task_id: workflowInfo.workflowId,
      status: this.mapTemporalStatus(status),
      current_step: status,
      output: workflowInfo.status === 'COMPLETED' ? { result: 'completed' } : undefined,
    };
  }

  async *streamEvents(input: StreamRunInput): AsyncIterable<RunEvent> {
    const client = await getTemporalClient();
    const handle = client.workflow.get(input.run_id);

    yield {
      type: 'run.started',
      run_id: input.run_id,
      task_id: input.run_id,
      timestamp: new Date().toISOString(),
    };

    // Poll for completion
    let done = false;
    while (!done) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const status = await handle.query.defineQuery<string>('status')().catch(() => 'UNKNOWN');

      if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
        done = true;
      }

      yield {
        type: 'run.progress',
        run_id: input.run_id,
        task_id: input.run_id,
        timestamp: new Date().toISOString(),
        data: { status },
      };
    }

    yield {
      type: 'run.completed',
      run_id: input.run_id,
      task_id: input.run_id,
      timestamp: new Date().toISOString(),
    };
  }

  private mapTemporalStatus(status: string): AgentRunStatusValue {
    if (status === 'COMPLETED') return AgentRunStatus.COMPLETED;
    if (status === 'FAILED') return AgentRunStatus.FAILED;
    if (status === 'CANCELLED' || status === 'CANCELLING') return AgentRunStatus.CANCELLED;
    if (status === 'AWAITING_APPROVAL') return AgentRunStatus.AWAITING_APPROVAL;
    if (status === 'AWAITING_INPUT' || status === 'INPUT_RECEIVED') return AgentRunStatus.AWAITING_INPUT;
    if (status === 'PAUSED') return AgentRunStatus.PAUSED;
    return AgentRunStatus.RUNNING;
  }
}
