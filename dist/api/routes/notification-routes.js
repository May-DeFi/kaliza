import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { success } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { listWorkspaceNotifications } from '../../domain/notifications/notification-service.js';
const router = Router();
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const notifications = await listWorkspaceNotifications(workspace_id);
        success(res, notifications);
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=notification-routes.js.map