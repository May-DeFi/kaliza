import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { Task, TaskStep, TaskTransition } from '../../contracts/types.js';
import { NotFoundError, ConflictError } from '../../api/middleware/errors.js';
import { TaskStatus, type TaskStatusValue } from '../../config/constants.js';
import { assertCanTransition } from './task-state-machine.js';
import { recordAuditEvent } from '../audit/audit-service.js';
import { generateCorrelationId, generateIdempotencyKey } from '../../adapters/encryption/crypto.js';

export async function createTask(input: {
  workspace_id: string;
  service_id?: string;
  conversation_id?: string;
  objective: string;
  user_id?: string;
  idempotency_key?: string;
  priority?: number;
}): Promise<Task> {
  const supabase = getSupabaseAdminClient();

  const idempotencyKey = input.idempotency_key ?? generateIdempotencyKey();

  if (input.idempotency_key) {
    const { data: existing } = await supabase
      .from('tasks')
      .select('*')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();

    if (existing) return existing as Task;
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: input.workspace_id,
      service_id: input.service_id ?? null,
      conversation_id: input.conversation_id ?? null,
      objective: input.objective,
      status: TaskStatus.RECEIVED,
      priority: input.priority ?? 5,
      idempotency_key: idempotencyKey,
      version: 1,
      user_id: input.user_id ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  const task = data as Task;

  await recordTaskTransition(task.id, 'CREATED', TaskStatus.RECEIVED, 'system', 'Task created', task.version);

  return task;
}

export async function getTask(id: string): Promise<Task> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('Task', id);
  return data as Task;
}

export async function listWorkspaceTasks(
  workspaceId: string,
  filters?: { status?: TaskStatusValue; limit?: number; offset?: number },
): Promise<{ tasks: Task[]; total: number }> {
  const supabase = getSupabaseAdminClient();
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);

  if (error) throw error;
  return { tasks: (data ?? []) as Task[], total: count ?? 0 };
}

export async function transitionTask(
  taskId: string,
  toStatus: TaskStatusValue,
  actor: string,
  reason?: string,
  runReference?: string,
): Promise<Task> {
  const supabase = getSupabaseAdminClient();

  const { data: task, error: fetchErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!task) throw new NotFoundError('Task', taskId);

  const current = task as Task;
  const fromStatus = current.status as TaskStatusValue;
  assertCanTransition(fromStatus, toStatus);

  const newVersion = current.version + 1;

  const { data: updated, error: updateErr } = await supabase
    .from('tasks')
    .update({
      status: toStatus,
      version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('version', current.version)
    .select('*')
    .maybeSingle();

  if (updateErr) throw updateErr;
  if (!updated) throw new ConflictError('Task version conflict — retry the transition');

  const updatedTask = updated as Task;

  await recordTaskTransition(taskId, fromStatus, toStatus, actor, reason ?? `Transition ${fromStatus} -> ${toStatus}`, newVersion, runReference);

  await recordAuditEvent({
    workspace_id: current.workspace_id,
    actor,
    action: 'task.transition',
    target: 'task',
    target_id: taskId,
    correlation_id: generateCorrelationId(),
    metadata: { from: fromStatus, to: toStatus, version: newVersion },
  });

  return updatedTask;
}

export async function cancelTask(taskId: string, actor: string, reason?: string): Promise<Task> {
  return transitionTask(taskId, TaskStatus.CANCELLED, actor, reason ?? 'Cancelled by user');
}

export async function resumeTask(taskId: string, actor: string): Promise<Task> {
  const task = await getTask(taskId);
  const status = task.status as TaskStatusValue;

  if (status === TaskStatus.FAILED || status === TaskStatus.EXPIRED) {
    return transitionTask(taskId, TaskStatus.QUEUED, actor, 'Resuming from recoverable state');
  }
  if (status === TaskStatus.AWAITING_INPUT) {
    return transitionTask(taskId, TaskStatus.QUEUED, actor, 'Resuming after user input');
  }

  throw new ConflictError(`Cannot resume task in status: ${status}`);
}

export async function addTaskStep(input: {
  task_id: string;
  sequence: number;
  step_type: string;
  input_ref?: string;
  metadata?: Record<string, unknown>;
}): Promise<TaskStep> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('task_steps')
    .insert({
      task_id: input.task_id,
      sequence: input.sequence,
      step_type: input.step_type,
      status: 'PENDING',
      input_ref: input.input_ref ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as TaskStep;
}

export async function updateTaskStep(
  stepId: string,
  updates: { status?: string; output_ref?: string; metadata?: Record<string, unknown> },
): Promise<TaskStep> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('task_steps')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', stepId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('TaskStep', stepId);
  return data as TaskStep;
}

export async function listTaskSteps(taskId: string): Promise<TaskStep[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('task_steps')
    .select('*')
    .eq('task_id', taskId)
    .order('sequence', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TaskStep[];
}

export async function listTaskTransitions(taskId: string): Promise<TaskTransition[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('task_transitions')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TaskTransition[];
}

export async function recordTaskTransition(
  taskId: string,
  fromStatus: string,
  toStatus: string,
  actor: string,
  reason: string,
  taskVersion: number,
  runReference?: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('task_transitions').insert({
    task_id: taskId,
    from_status: fromStatus,
    to_status: toStatus,
    actor,
    reason,
    task_version: taskVersion,
    run_reference: runReference ?? null,
  });

  if (error) throw error;
}

export async function findStuckTasks(): Promise<Task[]> {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .in('status', [TaskStatus.EXECUTING, TaskStatus.QUEUED])
    .lt('updated_at', cutoff);

  if (error) throw error;
  return (data ?? []) as Task[];
}
