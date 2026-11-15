import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireWorkspaceAccess, requireRole } from '../middleware/auth.js';
import { success } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { getSubscription, upgradePlan, checkEntitlement, getPlanLimits } from '../../domain/billing/billing-service.js';
const router = Router();
router.get('/:workspaceId/subscription', authenticate, requireWorkspaceAccess, async (req, res, next) => {
    try {
        const sub = await getSubscription(req.params.workspaceId);
        success(res, sub);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:workspaceId/entitlement', authenticate, requireWorkspaceAccess, async (req, res, next) => {
    try {
        const { category } = req.query;
        if (!category)
            throw new ValidationError('category query parameter required');
        const result = await checkEntitlement(req.params.workspaceId, category);
        success(res, result);
    }
    catch (err) {
        next(err);
    }
});
const upgradeSchema = z.object({
    plan: z.enum(['FREE', 'STARTER', 'GROWTH', 'SCALE']),
});
router.post('/:workspaceId/upgrade', authenticate, requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
    try {
        const parsed = upgradeSchema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const sub = await upgradePlan(req.params.workspaceId, parsed.data.plan);
        success(res, sub);
    }
    catch (err) {
        next(err);
    }
});
router.get('/plans', authenticate, async (_req, res, next) => {
    try {
        const plans = Object.entries(getPlanLimits('FREE') ? {
            FREE: getPlanLimits('FREE'),
            STARTER: getPlanLimits('STARTER'),
            GROWTH: getPlanLimits('GROWTH'),
            SCALE: getPlanLimits('SCALE'),
        } : {}).map(([name, limits]) => ({ name, limits }));
        success(res, plans);
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=billing-routes.js.map