import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { success } from '../middleware/response.js';
import { ForbiddenError, ValidationError } from '../middleware/errors.js';
import { getSystemHealth, getPlatformMetrics, getCorrelationTrail } from '../../domain/observability/observability.js';
import { listPendingWebhooks } from '../../domain/channels/webhook-service.js';
import { findStuckTasks } from '../../domain/tasks/task-service.js';
import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
const router = Router();
function requireAdmin(req, _res, next) {
    if (!req.userId) {
        next(new ForbiddenError('Authentication required'));
        return;
    }
    next(new ForbiddenError('Admin access requires elevated permissions — configure admin role mapping'));
}
router.get('/health', authenticate, async (_req, res, next) => {
    try {
        const health = await getSystemHealth();
        success(res, health);
    }
    catch (err) {
        next(err);
    }
});
router.get('/metrics', authenticate, async (_req, res, next) => {
    try {
        const metrics = await getPlatformMetrics();
        success(res, metrics);
    }
    catch (err) {
        next(err);
    }
});
router.get('/audit/:correlationId', authenticate, async (req, res, next) => {
    try {
        const trail = await getCorrelationTrail(req.params.correlationId);
        success(res, trail);
    }
    catch (err) {
        next(err);
    }
});
router.get('/stuck-tasks', authenticate, async (_req, res, next) => {
    try {
        const tasks = await findStuckTasks();
        success(res, tasks);
    }
    catch (err) {
        next(err);
    }
});
router.get('/pending-webhooks', authenticate, async (_req, res, next) => {
    try {
        const webhooks = await listPendingWebhooks();
        success(res, webhooks);
    }
    catch (err) {
        next(err);
    }
});
router.get('/failed-jobs', authenticate, async (_req, res, next) => {
    try {
        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase
            .from('job_queue')
            .select('*')
            .eq('status', 'DEAD_LETTER')
            .order('updated_at', { ascending: false })
            .limit(50);
        if (error)
            throw error;
        success(res, data ?? []);
    }
    catch (err) {
        next(err);
    }
});
router.post('/replay-webhook/:id', authenticate, async (req, res, next) => {
    try {
        const supabase = getSupabaseAdminClient();
        const { data: webhook } = await supabase
            .from('webhook_events')
            .select('*')
            .eq('id', req.params.id)
            .maybeSingle();
        if (!webhook)
            throw new ValidationError('Webhook not found');
        await supabase
            .from('webhook_events')
            .update({ processed: false, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        success(res, { replayed: true });
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=admin-routes.js.map