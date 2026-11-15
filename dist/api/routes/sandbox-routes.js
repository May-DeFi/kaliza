import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { provisionSandbox, getSandbox, executeInSandbox, pauseSandbox, resumeSandbox, terminateSandbox, listWorkspaceSandboxes, } from '../../domain/tasks/sandbox-manager.js';
const router = Router();
const provisionSchema = z.object({
    workspace_id: z.string().uuid(),
    task_id: z.string().uuid().optional(),
    image: z.string().optional(),
    resource_limits: z.record(z.unknown()).optional(),
});
router.post('/', authenticate, async (req, res, next) => {
    try {
        const parsed = provisionSchema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const sandbox = await provisionSandbox(parsed.data);
        created(res, sandbox);
    }
    catch (err) {
        next(err);
    }
});
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const sandboxes = await listWorkspaceSandboxes(workspace_id);
        success(res, sandboxes);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const sandbox = await getSandbox(req.params.id);
        success(res, sandbox);
    }
    catch (err) {
        next(err);
    }
});
const executeSchema = z.object({
    command: z.string().min(1),
    timeout_ms: z.number().int().min(1000).max(300000).optional(),
});
router.post('/:id/execute', authenticate, async (req, res, next) => {
    try {
        const parsed = executeSchema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const result = await executeInSandbox({
            sandbox_id: req.params.id,
            command: parsed.data.command,
            timeout_ms: parsed.data.timeout_ms,
        });
        success(res, result);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/pause', authenticate, async (req, res, next) => {
    try {
        const sandbox = await pauseSandbox(req.params.id);
        success(res, sandbox);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/resume', authenticate, async (req, res, next) => {
    try {
        const sandbox = await resumeSandbox(req.params.id);
        success(res, sandbox);
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        await terminateSandbox(req.params.id);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=sandbox-routes.js.map