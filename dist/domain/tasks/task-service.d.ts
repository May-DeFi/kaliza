import type { Task, TaskStep, TaskTransition } from '../../contracts/types.js';
import { type TaskStatusValue } from '../../config/constants.js';
export declare function createTask(input: {
    workspace_id: string;
    service_id?: string;
    conversation_id?: string;
    objective: string;
    user_id?: string;
    idempotency_key?: string;
    priority?: number;
}): Promise<Task>;
export declare function getTask(id: string): Promise<Task>;
export declare function listWorkspaceTasks(workspaceId: string, filters?: {
    status?: TaskStatusValue;
    limit?: number;
    offset?: number;
}): Promise<{
    tasks: Task[];
    total: number;
}>;
export declare function transitionTask(taskId: string, toStatus: TaskStatusValue, actor: string, reason?: string, runReference?: string): Promise<Task>;
export declare function cancelTask(taskId: string, actor: string, reason?: string): Promise<Task>;
export declare function resumeTask(taskId: string, actor: string): Promise<Task>;
export declare function addTaskStep(input: {
    task_id: string;
    sequence: number;
    step_type: string;
    input_ref?: string;
    metadata?: Record<string, unknown>;
}): Promise<TaskStep>;
export declare function updateTaskStep(stepId: string, updates: {
    status?: string;
    output_ref?: string;
    metadata?: Record<string, unknown>;
}): Promise<TaskStep>;
export declare function listTaskSteps(taskId: string): Promise<TaskStep[]>;
export declare function listTaskTransitions(taskId: string): Promise<TaskTransition[]>;
export declare function recordTaskTransition(taskId: string, fromStatus: string, toStatus: string, actor: string, reason: string, taskVersion: number, runReference?: string): Promise<void>;
export declare function findStuckTasks(): Promise<Task[]>;
//# sourceMappingURL=task-service.d.ts.map