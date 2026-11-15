import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { success } from '../middleware/response.js';
import { listTools, getToolDefinition } from '../../domain/tools/tool-gateway.js';
import { NotFoundError } from '../middleware/errors.js';

const router = Router();

router.get('/', authenticate, async (_req, res, next) => {
  try {
    const tools = await listTools();
    success(res, tools);
  } catch (err) {
    next(err);
  }
});

router.get('/:toolId', authenticate, async (req, res, next) => {
  try {
    const tool = await getToolDefinition(req.params.toolId);
    success(res, tool);
  } catch (err) {
    next(err);
  }
});

export default router;
