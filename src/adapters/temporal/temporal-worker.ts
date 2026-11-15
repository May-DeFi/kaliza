import { Worker } from '@temporalio/worker';
import { getTemporalClient, getTaskQueue, isTemporalConfigured } from './temporal-client.js';
import * as activities from './agent-activities.js';
import { logger } from '../../config/logger.js';

let worker: Worker | null = null;

export async function startTemporalWorker(): Promise<Worker> {
  if (!isTemporalConfigured()) {
    logger.warn('Temporal not configured — worker not started');
    return null as unknown as Worker;
  }

  const client = await getTemporalClient();
  const taskQueue = getTaskQueue();

  worker = await Worker.create({
    workflowsPath: new URL('./agent-workflow.js', import.meta.url).pathname,
    activities,
    taskQueue,
  });

  logger.info('Temporal worker starting', { taskQueue });

  worker.run().catch((err) => {
    logger.error('Temporal worker fatal error', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });

  return worker;
}

export async function stopTemporalWorker(): Promise<void> {
  if (worker) {
    worker.shutdown();
    worker = null;
    logger.info('Temporal worker stopped');
  }
}

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  startTemporalWorker().catch((err) => {
    logger.error('Failed to start Temporal worker', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}
