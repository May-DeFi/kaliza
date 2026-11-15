import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import {
  startBusinessGrowthTask,
  classifyObjective,
  generateContentPlan,
  requestApprovalForAction,
  completeBusinessGrowthTask,
  WORKFLOW_DEFINITIONS,
} from '../../services/business-growth/index.js';

const router = Router();

router.get('/workflows', authenticate, async (_req, res, next) => {
  try {
    success(res, WORKFLOW_DEFINITIONS);
  } catch (err) {
    next(err);
  }
});

const startTaskSchema = z.object({
  workspace_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional(),
  objective: z.string().min(1).max(5000),
  capability: z.string().optional(),
});

router.post('/tasks', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = startTaskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    if (!req.userId) throw new ValidationError('No user ID');
    const result = await startBusinessGrowthTask({
      workspace_id: parsed.data.workspace_id,
      user_id: req.userId,
      conversation_id: parsed.data.conversation_id,
      objective: parsed.data.objective,
      capability: parsed.data.capability,
    });
    created(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/classify', authenticate, async (req, res, next) => {
  try {
    const { objective } = req.body as { objective?: string };
    if (!objective) throw new ValidationError('objective is required');
    const result = await classifyObjective(objective);
    success(res, result);
  } catch (err) {
    next(err);
  }
});

const contentPlanSchema = z.object({
  workspace_id: z.string().uuid(),
  task_id: z.string().uuid(),
  brand_context: z.string().min(1),
});

router.post('/content-plan', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = contentPlanSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    if (!req.userId) throw new ValidationError('No user ID');
    const plan = await generateContentPlan({
      workspace_id: parsed.data.workspace_id,
      task_id: parsed.data.task_id,
      user_id: req.userId,
      brandContext: parsed.data.brand_context,
    });
    success(res, { plan });
  } catch (err) {
    next(err);
  }
});

const approvalSchema = z.object({
  workspace_id: z.string().uuid(),
  task_id: z.string().uuid(),
  action: z.string().min(1),
  payload: z.record(z.unknown()),
});

router.post('/request-approval', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    if (!req.userId) throw new ValidationError('No user ID');
    const approvalId = await requestApprovalForAction({
      workspace_id: parsed.data.workspace_id,
      task_id: parsed.data.task_id,
      user_id: req.userId,
      action: parsed.data.action,
      payload: parsed.data.payload,
    });
    created(res, { approval_id: approvalId });
  } catch (err) {
    next(err);
  }
});

const completeSchema = z.object({
  task_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  result: z.string().min(1),
});

router.post('/complete', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    if (!req.userId) throw new ValidationError('No user ID');
    await completeBusinessGrowthTask({
      task_id: parsed.data.task_id,
      workspace_id: parsed.data.workspace_id,
      user_id: req.userId,
      result: parsed.data.result,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
