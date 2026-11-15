import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { success } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { listWorkspaceNotifications } from '../../domain/notifications/notification-service.js';

const router = Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { workspace_id } = req.query as { workspace_id?: string };
    if (!workspace_id) throw new ValidationError('workspace_id query parameter required');
    const notifications = await listWorkspaceNotifications(workspace_id);
    success(res, notifications);
  } catch (err) {
    next(err);
  }
});

export default router;
