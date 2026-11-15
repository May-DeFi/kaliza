import type { WebhookEvent } from '../../contracts/types.js';
export declare function deduplicateWebhook(provider: string, eventId: string): Promise<boolean>;
export declare function markWebhookProcessed(provider: string, eventId: string, eventType: string, payloadRef?: string): Promise<void>;
export declare function listPendingWebhooks(limit?: number): Promise<WebhookEvent[]>;
//# sourceMappingURL=webhook-service.d.ts.map