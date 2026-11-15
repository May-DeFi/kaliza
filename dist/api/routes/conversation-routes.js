import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { getOrCreateConversation, getConversation, listWorkspaceConversations, addMessage, listMessages, } from '../../domain/conversations/conversation-service.js';
const router = Router();
router.get('/', authenticate, async (req, res, next) => {
    try {
        if (!req.userId)
            throw new ValidationError('No user ID');
        const { workspace_id } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const conversations = await listWorkspaceConversations(workspace_id);
        success(res, conversations);
    }
    catch (err) {
        next(err);
    }
});
router.post('/', authenticate, async (req, res, next) => {
    try {
        const schema = z.object({
            workspace_id: z.string().uuid(),
            channel: z.enum(['WHATSAPP', 'WEB']).default('WHATSAPP'),
            external_thread_id: z.string().min(1),
            user_id: z.string().uuid().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const conversation = await getOrCreateConversation(parsed.data);
        created(res, conversation);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const conversation = await getConversation(req.params.id);
        success(res, conversation);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/messages', authenticate, async (req, res, next) => {
    try {
        const messages = await listMessages(req.params.id);
        success(res, messages);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/messages', authenticate, async (req, res, next) => {
    try {
        const schema = z.object({
            direction: z.enum(['INBOUND', 'OUTBOUND']).default('INBOUND'),
            content: z.string().optional(),
            content_type: z.string().default('TEXT'),
            attachments: z.array(z.record(z.unknown())).optional(),
            provider_message_id: z.string().optional(),
            delivery_state: z.string().default('PENDING'),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success)
            throw new ValidationError('Invalid input', parsed.error.issues);
        const message = await addMessage({
            conversation_id: req.params.id,
            ...parsed.data,
        });
        created(res, message);
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=conversation-routes.js.map