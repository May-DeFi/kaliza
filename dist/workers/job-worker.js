import { dequeue, completeJob, failJob } from '../adapters/queue/job-queue.js';
import { logger } from '../config/logger.js';
import { processWhatsAppMessage } from './handlers/whatsapp-handler.js';
const HANDLERS = {
    'whatsapp.message.received': processWhatsAppMessage,
};
const POLL_INTERVAL_MS = 2000;
let running = false;
export async function processOneJob() {
    const job = await dequeue();
    if (!job)
        return false;
    const handler = HANDLERS[job.job_type];
    if (!handler) {
        logger.warn('No handler for job type', { jobType: job.job_type, jobId: job.id });
        await failJob(job.id, `No handler for job type: ${job.job_type}`);
        return true;
    }
    logger.info('Processing job', { jobId: job.id, jobType: job.job_type, attempt: job.attempts });
    try {
        await handler(job);
        await completeJob(job.id);
        logger.info('Job completed', { jobId: job.id, jobType: job.job_type });
        return true;
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Job failed', { jobId: job.id, jobType: job.job_type, error: errMsg });
        await failJob(job.id, errMsg);
        return true;
    }
}
export async function startWorker() {
    running = true;
    logger.info('Job worker started');
    while (running) {
        try {
            const hadWork = await processOneJob();
            if (!hadWork) {
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            }
        }
        catch (err) {
            logger.error('Worker loop error', { error: err instanceof Error ? err.message : String(err) });
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
    }
    logger.info('Job worker stopped');
}
export function stopWorker() {
    running = false;
}
if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
    startWorker().catch((err) => {
        logger.error('Fatal worker error', { error: err instanceof Error ? err.message : String(err) });
        process.exit(1);
    });
}
//# sourceMappingURL=job-worker.js.map