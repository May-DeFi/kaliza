import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { success, created, successPaginated } from '../middleware/response.js';
import { ValidationError, ConflictError } from '../middleware/errors.js';
import { createTask, getTask, listWorkspaceTasks, transitionTask, cancelTask, resumeTask, addTaskStep, updateTaskStep, listTaskSteps, listTaskTransitions, } from '../../domain/tasks/task-service.js';
import { canTransition } from '../../domain/tasks/task-state-machine.js';
const router = Router();
const createSchema = z.object({
    workspace_id: z.string().uuid(),
    service_id: z.string().optional(),
    conversation_id: z.string().uuid().optional(),
    objective: z.string().min(1).max(5000),
    user_id: z.string().uuid().optional(),
    idempotency_key: z.string().optional(),
    priority: z.number().int().min(1).max(10).default(5),
});
router.post('/', authenticate, async (req, res, next) => {
    try {
        const parsed = createSchema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        if (!req.userId)
            throw new ValidationError('No user ID');
        const task = await createTask({ ...parsed.data, user_id: parsed.data.user_id ?? req.userId });
        created(res, task);
    }
    catch (err) {
        next(err);
    }
});
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, status, limit, offset } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const result = await listWorkspaceTasks(workspace_id, {
            status: status,
            limit: limit ? parseInt(limit, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0,
        });
        successPaginated(res, result.tasks, offset ? parseInt(offset, 10) / (limit ? parseInt(limit, 10) : 50) + 1 : 1, limit ? parseInt(limit, 10) : 50, result.total);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const task = await getTask(req.params.id);
        success(res, task);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/cancel', authenticate, async (req, res, next) => {
    try {
        if (!req.userId)
            throw new ValidationError('No user ID');
        const reason = req.body.reason;
        const task = await cancelTask(req.params.id, req.userId, reason);
        success(res, task);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/resume', authenticate, async (req, res, next) => {
    try {
        if (!req.userId)
            throw new ValidationError('No user ID');
        const task = await resumeTask(req.params.id, req.userId);
        success(res, task);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/transition', authenticate, async (req, res, next) => {
    try {
        const schema = z.object({
            to_status: z.string(),
            reason: z.string().optional(),
            run_reference: z.string().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        if (!req.userId)
            throw new ValidationError('No user ID');
        const task = await getTask(req.params.id);
        const fromStatus = task.status;
        const toStatus = parsed.data.to_status;
        if (!canTransition(fromStatus, toStatus)) {
            throw new ConflictError(`Invalid transition: ${fromStatus} -> ${toStatus}`);
        }
        const updated = await transitionTask(req.params.id, toStatus, req.userId, parsed.data.reason, parsed.data.run_reference);
        success(res, updated);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/steps', authenticate, async (req, res, next) => {
    try {
        const steps = await listTaskSteps(req.params.id);
        success(res, steps);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/steps', authenticate, async (req, res, next) => {
    try {
        const schema = z.object({
            sequence: z.number().int().min(0),
            step_type: z.string().min(1),
            input_ref: z.string().optional(),
            metadata: z.record(z.unknown()).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const step = await addTaskStep({ task_id: req.params.id, ...parsed.data });
        created(res, step);
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id/steps/:stepId', authenticate, async (req, res, next) => {
    try {
        const schema = z.object({
            status: z.string().optional(),
            output_ref: z.string().optional(),
            metadata: z.record(z.unknown()).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const step = await updateTaskStep(req.params.stepId, parsed.data);
        success(res, step);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/transitions', authenticate, async (req, res, next) => {
    try {
        const transitions = await listTaskTransitions(req.params.id);
        success(res, transitions);
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=task-routes.js.map