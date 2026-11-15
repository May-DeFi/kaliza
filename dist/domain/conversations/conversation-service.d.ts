import type { Conversation, Message } from '../../contracts/types.js';
import { ConversationChannel, MessageDirection } from '../../config/constants.js';
export declare function getOrCreateConversation(input: {
    workspace_id: string;
    channel: string;
    external_thread_id: string;
    user_id?: string;
}): Promise<Conversation>;
export declare function getConversation(id: string): Promise<Conversation>;
export declare function listWorkspaceConversations(workspaceId: string): Promise<Conversation[]>;
export declare function addMessage(input: {
    conversation_id: string;
    direction: string;
    content?: string;
    content_type?: string;
    attachments?: Record<string, unknown>[];
    provider_message_id?: string;
    delivery_state?: string;
}): Promise<Message>;
export declare function listMessages(conversationId: string): Promise<Message[]>;
export declare function updateMessageDelivery(providerMessageId: string, deliveryState: string): Promise<void>;
export { ConversationChannel, MessageDirection };
//# sourceMappingURL=conversation-service.d.ts.map