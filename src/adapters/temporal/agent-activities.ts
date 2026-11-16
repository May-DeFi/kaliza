import { Context } from '@temporalio/activity';
import { AgentRunCancelledError, buildAgentGraphWithCheckpoint } from '../langgraph/agent-runtime.js';
import { getSupabaseAdminClient } from '../database/supabase.js';
import { getTask, transitionTask } from '../../domain/tasks/task-service.js';
import { notifyTaskEvent } from '../../domain/notifications/notification-service.js';
import { recordAuditEvent } from '../../domain/audit/audit-service.js';
import { TaskStatus, AgentRunStatus, type TaskStatusValue } from '../../config/constants.js';
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

export async function waitForAgentRunControl(agentRunId: string, taskId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  while (true) {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('status')
      .eq('id', agentRunId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`Agent run ${agentRunId} no longer exists`);
    if (data.status === AgentRunStatus.CANCELLED) throw new AgentRunCancelledError();
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('status')
      .eq('id', taskId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) throw new Error(`Task ${taskId} no longer exists`);
    if (task.status === TaskStatus.CANCELLED) throw new AgentRunCancelledError();
    if (data.status !== AgentRunStatus.PAUSED) return;

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function updateAgentRunStatus(agentRunId: string, status: string): Promise<void> {
  let query = getSupabaseAdminClient()
    .from('agent_runs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', agentRunId);

  if (status !== AgentRunStatus.CANCELLED) {
    query = query.neq('status', AgentRunStatus.CANCELLED);
  }
  const { data, error } = await query.select('id').maybeSingle();

  if (error) throw error;
  if (!data && status !== AgentRunStatus.CANCELLED) {
    const { data: current, error: readError } = await getSupabaseAdminClient()
      .from('agent_runs')
      .select('status')
      .eq('id', agentRunId)
      .maybeSingle();
    if (readError) throw readError;
    if (current?.status === AgentRunStatus.CANCELLED) throw new AgentRunCancelledError();
    if (!current) throw new Error(`Agent run ${agentRunId} no longer exists`);
  }
}

async function prepareTaskExecution(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  let status = task.status as TaskStatusValue;

  if (status === TaskStatus.PLANNED || status === TaskStatus.AWAITING_APPROVAL || status === TaskStatus.AWAITING_INPUT
    || status === TaskStatus.FAILED || status === TaskStatus.EXPIRED) {
    await transitionTask(taskId, TaskStatus.QUEUED, 'temporal-activity', 'Task queued for agent execution');
    status = TaskStatus.QUEUED;
  }

  if (status === TaskStatus.QUEUED) {
    await transitionTask(taskId, TaskStatus.EXECUTING, 'temporal-activity', 'Agent workflow starting');
    return;
  }
  if (status !== TaskStatus.EXECUTING) {
    throw new Error(`Cannot execute task in status ${status}`);
  }
}

type AgentRunContext = Pick<AgentRunInput, 'task_id' | 'workspace_id' | 'user_id' | 'agent_run_id'>;

async function finalizeAgentRun(input: AgentRunContext, status: string, finalResult: string, tokensUsed: number, approvalId: string | null): Promise<AgentRunResult> {
  if (status === AgentRunStatus.COMPLETED) {
    await transitionTask(input.task_id, TaskStatus.VERIFYING, 'temporal-activity', 'Agent workflow completed');
    await transitionTask(input.task_id, TaskStatus.COMPLETED, 'temporal-activity', finalResult || 'Task completed');
  } else if (status === AgentRunStatus.AWAITING_APPROVAL) {
    await transitionTask(input.task_id, TaskStatus.AWAITING_APPROVAL, 'temporal-activity', 'Awaiting approval');
  } else if (status === AgentRunStatus.AWAITING_INPUT) {
    await transitionTask(input.task_id, TaskStatus.AWAITING_INPUT, 'temporal-activity', 'Awaiting user input');
  } else if (status === AgentRunStatus.CANCELLED) {
    await updateAgentRunStatus(input.agent_run_id, AgentRunStatus.CANCELLED);
    return { task_id: input.task_id, agent_run_id: input.agent_run_id, status, final_result: finalResult || 'Cancelled', tokens_used: tokensUsed, approval_id: approvalId };
  } else {
    await transitionTask(input.task_id, TaskStatus.FAILED, 'temporal-activity', finalResult || 'Agent workflow failed');
  }

  await updateAgentRunStatus(input.agent_run_id, status);
  if (status === AgentRunStatus.COMPLETED) {
    await notifyTaskEvent({ workspace_id: input.workspace_id, user_id: input.user_id, task_id: input.task_id, event: 'completed', message: finalResult || 'Task completed' });
  } else if (status !== AgentRunStatus.AWAITING_APPROVAL && status !== AgentRunStatus.AWAITING_INPUT) {
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

  return {
    task_id: input.task_id,
    agent_run_id: input.agent_run_id,
    status,
    final_result: finalResult,
    tokens_used: tokensUsed,
    approval_id: approvalId,
  };
}

export async function runAgentWorkflowActivity(input: AgentRunInput): Promise<AgentRunResult> {
  const info = Context.current().info;
  logger.info('Temporal activity: runAgentWorkflow', { taskId: input.task_id, activityId: info.activityId, attempt: info.attempt });

  try {
    await waitForAgentRunControl(input.agent_run_id, input.task_id);
    await prepareTaskExecution(input.task_id);

    const graph = buildAgentGraphWithCheckpoint(input.workspace_id, () => waitForAgentRunControl(input.agent_run_id, input.task_id));

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
    await waitForAgentRunControl(input.agent_run_id, input.task_id);

    const status = finalState.status as string;
    const finalResult = finalState.final_result as string;
    const tokensUsed = finalState.tokens_used as number;
    return finalizeAgentRun(
      input,
      status,
      finalResult,
      tokensUsed,
      (finalState.pending_approval_id as string | null | undefined) ?? null,
    );
  } catch (err) {
    if (err instanceof AgentRunCancelledError) {
      await updateAgentRunStatus(input.agent_run_id, AgentRunStatus.CANCELLED);
      return { task_id: input.task_id, agent_run_id: input.agent_run_id, status: AgentRunStatus.CANCELLED, final_result: 'Cancelled at an execution checkpoint', tokens_used: 0 };
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('Agent workflow activity failed', { taskId: input.task_id, error: errMsg });
    try {
      await updateAgentRunStatus(input.agent_run_id, AgentRunStatus.FAILED);
    } catch (statusErr) {
      if (statusErr instanceof AgentRunCancelledError) {
        return { task_id: input.task_id, agent_run_id: input.agent_run_id, status: AgentRunStatus.CANCELLED, final_result: 'Cancelled at an execution checkpoint', tokens_used: 0 };
      }
      throw statusErr;
    }
    try { await transitionTask(input.task_id, TaskStatus.FAILED, 'temporal-activity', `Activity error: ${errMsg}`); } catch { /* may be terminal */ }
    throw err;
  }
}

export async function resumeAgentWorkflowActivity(input: {
  task_id: string;
  workspace_id: string;
  user_id: string;
  agent_run_id: string;
  thread_id: string;
  user_input?: string;
}): Promise<AgentRunResult> {
  logger.info('Temporal activity: resumeAgentWorkflow', { taskId: input.task_id });
  const graph = buildAgentGraphWithCheckpoint(input.workspace_id, () => waitForAgentRunControl(input.agent_run_id, input.task_id));
  const config = { configurable: { thread_id: input.thread_id, checkpoint_ns: '' }, recursionLimit: 25 };
  try {
    await waitForAgentRunControl(input.agent_run_id, input.task_id);
    await prepareTaskExecution(input.task_id);
    await updateAgentRunStatus(input.agent_run_id, AgentRunStatus.RUNNING);
    const finalState = await graph.invoke({ conversation_context: input.user_input ?? '', current_phase: 'supervisor' }, config);
    await waitForAgentRunControl(input.agent_run_id, input.task_id);
    return finalizeAgentRun(
      {
        task_id: input.task_id,
        workspace_id: input.workspace_id,
        user_id: input.user_id,
        agent_run_id: input.agent_run_id,
      },
      finalState.status as string,
      finalState.final_result as string,
      finalState.tokens_used as number,
      (finalState.pending_approval_id as string | null | undefined) ?? null,
    );
  } catch (err) {
    if (err instanceof AgentRunCancelledError) {
      await updateAgentRunStatus(input.agent_run_id, AgentRunStatus.CANCELLED);
      return { task_id: input.task_id, agent_run_id: input.agent_run_id, status: AgentRunStatus.CANCELLED, final_result: 'Cancelled at an execution checkpoint', tokens_used: 0 };
    }
    throw err;
  }
}
