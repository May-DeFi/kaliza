import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isPlaceholder } from '../../config/env.js';
import { deduplicateWebhook, markWebhookProcessed } from '../../domain/channels/webhook-service.js';
import { enqueue } from '../../adapters/queue/job-queue.js';
const router = Router();
function verifyWhatsAppSignature(body, signature) {
    if (isPlaceholder(env.meta.appSecret)) {
        logger.warn('Meta app secret is placeholder — skipping signature verification (dev only)');
        return true;
    }
    const expected = crypto
        .createHmac('sha256', env.meta.appSecret)
        .update(body)
        .digest('hex');
    return `sha256=${expected}` === signature;
}
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === env.meta.whatsappVerifyToken) {
        logger.info('WhatsApp webhook verified');
        res.status(200).send(challenge);
    }
    else {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Verification failed' } });
    }
});
router.post('/webhook', async (req, res) => {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-hub-signature-256'];
    if (signature && !verifyWhatsAppSignature(rawBody, signature)) {
        logger.warn('WhatsApp webhook signature verification failed');
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid signature' } });
        return;
    }
    try {
        const body = req.body;
        const entry = body?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];
        if (!message) {
            res.status(200).json({ status: 'ok', message: 'No message to process' });
            return;
        }
        const providerEventId = message.id ?? crypto.randomUUID();
        const isUnique = await deduplicateWebhook('whatsapp', providerEventId);
        if (!isUnique) {
            logger.info('Duplicate WhatsApp webhook ignored', { eventId: providerEventId });
            res.status(200).json({ status: 'ok', message: 'Duplicate event' });
            return;
        }
        await enqueue({
            job_type: 'whatsapp.message.received',
            payload: {
                from: value?.contacts?.[0]?.wa_id ?? message.from,
                from_name: value?.contacts?.[0]?.name?.formatted_name,
                message_id: message.id,
                message_type: message.type,
                text: message.text?.body ?? null,
                timestamp: message.timestamp,
                raw: value,
            },
        });
        await markWebhookProcessed('whatsapp', providerEventId, message.type ?? 'unknown');
        res.status(200).json({ status: 'ok', message: 'Webhook received and queued' });
    }
    catch (err) {
        logger.error('WhatsApp webhook processing error', { error: err instanceof Error ? err.message : String(err) });
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Webhook processing failed' } });
    }
});
export default router;
//# sourceMappingURL=whatsapp-webhook-routes.js.map