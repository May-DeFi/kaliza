import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { success } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { getUser, updateUser, findUserByAuthSubject } from '../../domain/identity/user-service.js';
const router = Router();
const updateSchema = z.object({
    full_name: z.string().min(1).max(200).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    profile: z.record(z.unknown()).optional(),
});
router.get('/me', authenticate, async (req, res, next) => {
    try {
        if (!req.authSubject)
            throw new ValidationError('No auth subject');
        const user = await findUserByAuthSubject(req.authSubject);
        if (!user)
            throw new ValidationError('User not found');
        success(res, user);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const user = await getUser(req.params.id);
        success(res, user);
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id', authenticate, async (req, res, next) => {
    try {
        const parsed = updateSchema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid update data', parsed.error.issues);
        if (req.params.id !== req.userId) {
            throw new ValidationError('Cannot update another user');
        }
        const user = await updateUser(req.params.id, parsed.data);
        success(res, user);
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=user-routes.js.map