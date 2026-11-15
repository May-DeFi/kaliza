import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import {
  createAgentRun,
  getAgentRun,
  listTaskAgentRuns,
  pauseAgentRun,
  cancelAgentRun,
  resumeAgentRun,
  getRunSnapshot,
} from '../../domain/agents/agent-run-service.js';

const router = Router();

const createSchema = z.object({
  task_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  service_id: z.string(),
  objective: z.string().min(1),
  tool_allowlist: z.array(z.string()).optional(),
  budget_limit_tokens: z.number().int().optional(),
});

router.post('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    const result = await createAgentRun(parsed.data);
    created(res, result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const run = await getAgentRun(req.params.id);
    success(res, run);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/snapshot', authenticate, async (req, res, next) => {
  try {
    const snapshot = await getRunSnapshot(req.params.id);
    success(res, snapshot);
  } catch (err) {
    next(err);
  }
});

router.get('/task/:taskId', authenticate, async (req, res, next) => {
  try {
    const runs = await listTaskAgentRuns(req.params.taskId);
    success(res, runs);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pause', authenticate, async (req, res, next) => {
  try {
    const run = await pauseAgentRun(req.params.id);
    success(res, run);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const run = await cancelAgentRun(req.params.id);
    success(res, run);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resume', authenticate, async (req, res, next) => {
  try {
    const userInput = (req.body as { user_input?: string }).user_input;
    const run = await resumeAgentRun(req.params.id, userInput);
    success(res, run);
  } catch (err) {
    next(err);
  }
});

export default router;
