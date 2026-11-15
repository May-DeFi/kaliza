import type { QueuedJob } from '../../adapters/queue/job-queue.js';
import { logger } from '../../config/logger.js';
import { findOrCreateUserByPhone } from '../../domain/identity/user-service.js';
import { createIndividualWorkspace } from '../../domain/tenancy/workspace-service.js';
import { getOrCreateConversation, addMessage } from '../../domain/conversations/conversation-service.js';
import { createTask } from '../../domain/tasks/task-service.js';
import { recordAuditEvent } from '../../domain/audit/audit-service.js';
import { ConversationChannel, MessageDirection, ServiceId, TaskStatus } from '../../config/constants.js';

interface WhatsAppPayload {
  from: string;
  from_name?: string;
  message_id: string;
  message_type: string;
  text: string | null;
  timestamp: string;
  raw: Record<string, unknown>;
}

export async function processWhatsAppMessage(job: QueuedJob): Promise<void> {
  const payload = job.payload as unknown as WhatsAppPayload;

  if (!payload.from || !payload.text) {
    logger.warn('WhatsApp message missing required fields', { jobId: job.id });
    return;
  }

  const user = await findOrCreateUserByPhone(payload.from, payload.from_name);

  const workspaces = await (await import('../../domain/tenancy/workspace-service.js')).listUserWorkspaces(user.id);
  let workspaceId: string;

  if (workspaces.length > 0) {
    workspaceId = workspaces[0].id;
  } else {
    const { workspace } = await createIndividualWorkspace(user.id, `${payload.from_name ?? payload.from}'s Workspace`);
    workspaceId = workspace.id;
  }

  const conversation = await getOrCreateConversation({
    workspace_id: workspaceId,
    channel: ConversationChannel.WHATSAPP,
    external_thread_id: payload.from,
    user_id: user.id,
  });

  await addMessage({
    conversation_id: conversation.id,
    direction: MessageDirection.INBOUND,
    content: payload.text,
    content_type: 'TEXT',
    provider_message_id: payload.message_id,
    delivery_state: 'DELIVERED',
  });

  const task = await createTask({
    workspace_id: workspaceId,
    service_id: ServiceId.BUSINESS_GROWTH,
    conversation_id: conversation.id,
    objective: payload.text,
    user_id: user.id,
  });

  await recordAuditEvent({
    workspace_id: workspaceId,
    actor: user.id,
    action: 'whatsapp.message.received',
    target: 'task',
    target_id: task.id,
    metadata: { message_id: payload.message_id, from: payload.from },
  });

  logger.info('WhatsApp message processed', {
    userId: user.id,
    workspaceId,
    conversationId: conversation.id,
    taskId: task.id,
  });
}
