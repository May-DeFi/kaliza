import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError, NotFoundError } from '../middleware/errors.js';
import {
  createApproval,
  getApproval,
  listTaskApprovals,
  listPendingApprovals,
  decideApproval,
} from '../../domain/approvals/approval-service.js';
import { ApprovalStatus, RiskClass } from '../../config/constants.js';

const router = Router();

const createSchema = z.object({
  task_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  risk: z.enum(['LOW', 'MODERATE', 'HIGH']).default('LOW'),
  payload: z.record(z.unknown()),
  expiry_hours: z.number().int().min(1).max(168).optional(),
});

router.post('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    const approval = await createApproval(parsed.data);
    created(res, approval);
  } catch (err) {
    next(err);
  }
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { workspace_id, task_id } = req.query as { workspace_id?: string; task_id?: string };
    if (task_id) {
      const approvals = await listTaskApprovals(task_id);
      success(res, approvals);
    } else if (workspace_id) {
      const approvals = await listPendingApprovals(workspace_id);
      success(res, approvals);
    } else {
      throw new ValidationError('workspace_id or task_id query parameter required');
    }
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const approval = await getApproval(req.params.id);
    success(res, approval);
  } catch (err) {
    next(err);
  }
});

const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  modified_payload: z.record(z.unknown()).optional(),
});

router.post('/:id/decision', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    if (!req.userId) throw new ValidationError('No user ID');

    const approval = await getApproval(req.params.id);
    const updated = await decideApproval({
      approval_id: req.params.id,
      decision: parsed.data.decision as any,
      approver_id: req.userId,
      workspace_id: approval.workspace_id,
      modified_payload: parsed.data.modified_payload,
    });
    success(res, updated);
  } catch (err) {
    next(err);
  }
});

export default router;
