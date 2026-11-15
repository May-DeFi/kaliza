import { findStuckTasks } from '../domain/tasks/task-service.js';
import { transitionTask } from '../domain/tasks/task-service.js';
import { reconcileSandboxLifecycles } from '../domain/tasks/sandbox-manager.js';
import { expireStaleApprovals } from '../domain/approvals/approval-service.js';
import { TaskStatus } from '../config/constants.js';
import { logger } from '../config/logger.js';

const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;
let running = false;

export async function runRecoveryCycle(): Promise<{
  stuck_tasks_reset: number;
  sandboxes_paused: number;
  sandboxes_terminated: number;
  approvals_expired: number;
}> {
  let stuckTasksReset = 0;

  const stuckTasks = await findStuckTasks();
  for (const task of stuckTasks) {
    try {
      await transitionTask(
        task.id,
        TaskStatus.FAILED,
        'recovery-worker',
        `Task stuck in ${task.status} for >30 minutes`,
      );
      stuckTasksReset++;
    } catch (err) {
      logger.error('Failed to reset stuck task', { taskId: task.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const sandboxResult = await reconcileSandboxLifecycles();

  const approvalsExpired = await expireStaleApprovals();

  logger.info('Recovery cycle complete', {
    stuckTasksReset,
    sandboxesPaused: sandboxResult.paused,
    sandboxesTerminated: sandboxResult.terminated,
    approvalsExpired,
  });

  return {
    stuck_tasks_reset: stuckTasksReset,
    sandboxes_paused: sandboxResult.paused,
    sandboxes_terminated: sandboxResult.terminated,
    approvals_expired: approvalsExpired,
  };
}

export async function startRecoveryWorker(): Promise<void> {
  running = true;
  logger.info('Recovery worker started');

  while (running) {
    try {
      await runRecoveryCycle();
    } catch (err) {
      logger.error('Recovery cycle error', { error: err instanceof Error ? err.message : String(err) });
    }
    await new Promise((resolve) => setTimeout(resolve, RECOVERY_INTERVAL_MS));
  }

  logger.info('Recovery worker stopped');
}

export function stopRecoveryWorker(): void {
  running = false;
}

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  startRecoveryWorker().catch((err) => {
    logger.error('Fatal recovery worker error', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
