import { Context, ActivityInfo } from '@temporalio/activity';
import { buildAgentGraphWithCheckpoint, buildAgentGraph } from './agent-runtime.js';
import { transitionTask, getTask } from '../../domain/tasks/task-service.js';
import { createAgentRun, getAgentRun, updateAgentRunStatus } from '../../domain/agents/agent-run-service.ts';
import { recordAuditEvent } from '../../domain/audit/audit-service.ts';
import { notifyTaskEvent } from '../../domain/notifications/notification-service.ts';
import { TaskStatus, AgentRunStatus } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import type { RunnableConfig } from '@langchain/langgraph';

export interface AgentRunInput {
  task_id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  objective: string;
  service_id: string;
  conversation_context?: string;
  tool_allowlist?: string[];
  budget_limit_tokens?: number;
  agent_run_id: string;
  thread_id: string;
}

export interface AgentRunResult {
  task_id: string;
  agent_run_id: string;
  status: string;
  final_result: string;
  tokens_used: number;
  error?: string;
}

export async function runAgentWorkflowActivity(input: AgentRunInput): Promise<AgentRunResult> {
  const activityInfo = Context.current().info;
  logger.info('Temporal activity: runAgentWorkflow', {
    taskId: input.task_id,
    activityId: activityInfo.activityId,
    attempt: activityInfo.attempt,
  });

  try {
    await transitionTask(input.task_id, TaskStatus.EXECUTING, 'temporal-activity', 'Agent workflow starting');

    const graph = buildAgentGraphWithCheckpoint(input.workspace_id);

    const config: RunnableConfig = {
      configurable: {
        thread_id: input.thread_id,
        checkpoint_ns: '',
      },
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
      conversation_context: input.conversation_context ?? '',
      tool_allowlist: input.tool_allowlist ?? [],
      budget_limit_tokens: input.budget_limit_tokens ?? 50000,
      current_phase: 'supervisor' as const,
      status: AgentRunStatus.RUNNING as string,
    };

    const finalState = await graph.invoke(initialState, config);

    const status = finalState.status as string;
    const finalResult = finalState.final_result as string;
    const tokensUsed = finalState.tokens_used as number;

    if (status === AgentRunStatus.COMPLETED) {
      await transitionTask(input.task_id, TaskStatus.VERIFYING, 'temporal-activity', 'Agent workflow completed, verifying');
      await transitionTask(input.task_id, TaskStatus.COMPLETED, 'temporal-activity', finalResult || 'Task completed');
      await notifyTaskEvent({
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        task_id: input.task_id,
        event: 'completed',
        message: finalResult || 'Task completed successfully',
      });
    } else {
      await transitionTask(input.task_id, TaskStatus.FAILED, 'temporal-activity', finalResult || 'Agent workflow failed');
      await notifyTaskEvent({
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        task_id: input.task_id,
        event: 'failed',
        message: finalResult || 'Task failed during execution',
      });
    }

    await recordAuditEvent({
      workspace_id: input.workspace_id,
      actor: input.user_id,
      action: 'agent.workflow_completed',
      target: 'task',
      target_id: input.task_id,
      metadata: { status, tokens_used: tokensUsed, agent_run_id: input.agent_run_id },
    });

    return {
      task_id: input.task_id,
      agent_run_id: input.agent_run_id,
      status,
      final_result: finalResult,
      tokens_used: tokensUsed,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Agent workflow activity failed', { taskId: input.task_id, error: errMsg });

    try {
      await transitionTask(input.task_id, TaskStatus.FAILED, 'temporal-activity', `Activity error: ${errMsg}`);
    } catch {
      // Task may already be in a terminal state
    }

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

  const config: RunnableConfig = {
    configurable: {
      thread_id: input.thread_id,
      checkpoint_ns: '',
    },
    recursionLimit: 25,
  };

  const resumeInput = {
    conversation_context: input.user_input ?? '',
    current_phase: 'supervisor',
  };

  const finalState = await graph.invoke(resumeInput, config);

  return {
    task_id: input.task_id,
    agent_run_id: input.agent_run_id,
    status: finalState.status as string,
    final_result: finalState.final_result as string,
    tokens_used: finalState.tokens_used as number,
  };
}
