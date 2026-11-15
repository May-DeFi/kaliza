import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { success } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { getWorkspaceUsageSummary, checkQuota } from '../../domain/usage/usage-service.js';
const router = Router();
router.get('/summary', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const summary = await getWorkspaceUsageSummary(workspace_id);
        success(res, summary);
    }
    catch (err) {
        next(err);
    }
});
router.get('/quota', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, category, limit } = req.query;
        if (!workspace_id || !category || !limit) {
            throw new ValidationError('workspace_id, category, and limit query parameters required');
        }
        const result = await checkQuota(workspace_id, category, parseInt(limit, 10));
        success(res, result);
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=usage-routes.js.map