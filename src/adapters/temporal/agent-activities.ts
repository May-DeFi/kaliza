import { Context } from '@temporalio/activity';
import { buildAgentGraphWithCheckpoint } from '../langgraph/agent-runtime.js';
import { transitionTask } from '../../domain/tasks/task-service.js';
import { notifyTaskEvent } from '../../domain/notifications/notification-service.js';
import { recordAuditEvent } from '../../domain/audit/audit-service.js';
import { TaskStatus, AgentRunStatus } from '../../config/constants.js';
import { logger } from '../../config/logger.js';

export interface AgentRunInput {
  task_id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  objective: string;
  service_id: string;
  conversation_context: string;
  tool_allowlist: string[];
  budget_limit_tokens: number;
  agent_run_id: string;
  thread_id: string;
  approval_id?: string | null;
}

export interface AgentRunResult {
  task_id: string;
  agent_run_id: string;
  status: string;
  final_result: string;
  tokens_used: number;
  approval_id?: string | null;
  error?: string;
}

export async function runAgentWorkflowActivity(input: AgentRunInput): Promise<AgentRunResult> {
  const info = Context.current().info;
  logger.info('Temporal activity: runAgentWorkflow', { taskId: input.task_id, activityId: info.activityId, attempt: info.attempt });

  try {
    await transitionTask(input.task_id, TaskStatus.EXECUTING, 'temporal-activity', 'Agent workflow starting');

    const graph = buildAgentGraphWithCheckpoint(input.workspace_id);

    const config = {
      configurable: { thread_id: input.thread_id, checkpoint_ns: '' },
      recursionLimit: 25,
    };

    const initialState = {
      workspace_id: input.workspace_id,
      task_id: input.task_id,
      agent_run_id: input.agent_run_id,
      user_id: input.user_id,
      role: input.role,
      objective: input.objective,
      service_id: input.service_id,
      conversation_context: input.conversation_context,
      tool_allowlist: input.tool_allowlist,
      budget_limit_tokens: input.budget_limit_tokens,
      current_phase: 'supervisor',
      status: AgentRunStatus.RUNNING,
    };

    const finalState = await graph.invoke(initialState, config);

    const status = finalState.status as string;
    const finalResult = finalState.final_result as string;
    const tokensUsed = finalState.tokens_used as number;

    if (status === AgentRunStatus.COMPLETED) {
      await transitionTask(input.task_id, TaskStatus.VERIFYING, 'temporal-activity', 'Agent workflow completed');
      await transitionTask(input.task_id, TaskStatus.COMPLETED, 'temporal-activity', finalResult || 'Task completed');
      await notifyTaskEvent({ workspace_id: input.workspace_id, user_id: input.user_id, task_id: input.task_id, event: 'completed', message: finalResult || 'Task completed' });
    } else {
      await transitionTask(input.task_id, TaskStatus.FAILED, 'temporal-activity', finalResult || 'Agent workflow failed');
      await notifyTaskEvent({ workspace_id: input.workspace_id, user_id: input.user_id, task_id: input.task_id, event: 'failed', message: finalResult || 'Task failed' });
    }

    await recordAuditEvent({
      workspace_id: input.workspace_id,
      actor: input.user_id,
      action: 'agent.workflow_completed',
      target: 'task',
      target_id: input.task_id,
      metadata: { status, tokens_used: tokensUsed, agent_run_id: input.agent_run_id },
    });

    return { task_id: input.task_id, agent_run_id: input.agent_run_id, status, final_result: finalResult, tokens_used: tokensUsed };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Agent workflow activity failed', { taskId: input.task_id, error: errMsg });
    try { await transitionTask(input.task_id, TaskStatus.FAILED, 'temporal-activity', `Activity error: ${errMsg}`); } catch { /* may be terminal */ }
    throw err;
  }
}

export async function resumeAgentWorkflowActivity(input: {
  task_id: string;
  workspace_id: string;
  agent_run_id: string;
  thread_id: string;
  user_input?: string;
}): Promise<AgentRunResult> {
  logger.info('Temporal activity: resumeAgentWorkflow', { taskId: input.task_id });
  const graph = buildAgentGraphWithCheckpoint(input.workspace_id);
  const config = { configurable: { thread_id: input.thread_id, checkpoint_ns: '' }, recursionLimit: 25 };
  const finalState = await graph.invoke({ conversation_context: input.user_input ?? '', current_phase: 'supervisor' }, config);
  return { task_id: input.task_id, agent_run_id: input.agent_run_id, status: finalState.status as string, final_result: finalState.final_result as string, tokens_used: finalState.tokens_used as number };
}
