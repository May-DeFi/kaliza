import { getPendingNotifications, deliverNotification } from '../domain/notifications/notification-service.js';
import { logger } from '../config/logger.js';
const POLL_INTERVAL_MS = 5000;
let running = false;
export async function processNotifications() {
    const notifications = await getPendingNotifications(20);
    let delivered = 0;
    for (const notification of notifications) {
        try {
            await deliverNotification(notification);
            delivered++;
        }
        catch (err) {
            logger.error('Notification delivery failed', {
                notificationId: notification.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return delivered;
}
export async function startNotificationWorker() {
    running = true;
    logger.info('Notification worker started');
    while (running) {
        try {
            const count = await processNotifications();
            if (count === 0) {
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            }
        }
        catch (err) {
            logger.error('Notification worker error', { error: err instanceof Error ? err.message : String(err) });
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
    }
    logger.info('Notification worker stopped');
}
export function stopNotificationWorker() {
    running = false;
}
if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
    startNotificationWorker().catch((err) => {
        logger.error('Fatal notification worker error', { error: err instanceof Error ? err.message : String(err) });
        process.exit(1);
    });
}
//# sourceMappingURL=notification-worker.js.map