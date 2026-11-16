import type { QueuedJob } from '../../adapters/queue/job-queue.js';
import { logger } from '../../config/logger.js';
import { findOrCreateUserByPhone } from '../../domain/identity/user-service.js';
import { createIndividualWorkspace, listUserWorkspaces } from '../../domain/tenancy/workspace-service.js';
import { getOrCreateConversation, addMessage } from '../../domain/conversations/conversation-service.js';
import { createTask, getTask, transitionTask } from '../../domain/tasks/task-service.js';
import { recordAuditEvent } from '../../domain/audit/audit-service.js';
import { listPendingApprovals, decideApproval } from '../../domain/approvals/approval-service.js';
import { startBusinessGrowthTask } from '../../services/business-growth/index.js';
import { notifyTaskEvent } from '../../domain/notifications/notification-service.js';
import { ConversationChannel, MessageDirection, ServiceId, TaskStatus, ApprovalStatus } from '../../config/constants.js';

interface WhatsAppPayload {
  from: string;
  from_name?: string;
  message_id: string;
  message_type: string;
  text: string | null;
  timestamp: string;
  raw: Record<string, unknown>;
}

const APPROVE_PATTERNS = /\b(approve|approved|yes|ok|go ahead|proceed|confirm)\b/i;
const REJECT_PATTERNS = /\b(reject|rejected|no|deny|cancel|stop|abort)\b/i;

export async function processWhatsAppMessage(job: QueuedJob): Promise<void> {
  const payload = job.payload as unknown as WhatsAppPayload;

  if (!payload.from || !payload.text) {
    logger.warn('WhatsApp message missing required fields', { jobId: job.id });
    return;
  }

  const user = await findOrCreateUserByPhone(payload.from, payload.from_name);

  const workspaces = await listUserWorkspaces(user.id);
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

  const isApprovalResponse = await tryHandleApprovalResponse({
    workspaceId, userId: user.id, text: payload.text,
  });

  if (isApprovalResponse) {
    logger.info('WhatsApp message handled as approval response', { userId: user.id, workspaceId });
    return;
  }

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

  await startBusinessGrowthTask({
    workspace_id: workspaceId,
    user_id: user.id,
    conversation_id: conversation.id,
    objective: payload.text,
  });

  logger.info('WhatsApp message processed — agent pipeline started', {
    userId: user.id,
    workspaceId,
    conversationId: conversation.id,
    taskId: task.id,
  });
}

async function tryHandleApprovalResponse(input: {
  workspaceId: string;
  userId: string;
  text: string;
}): Promise<boolean> {
  const pendingApprovals = await listPendingApprovals(input.workspaceId);
  if (pendingApprovals.length === 0) return false;

  const text = input.text.trim();
  const isApprove = APPROVE_PATTERNS.test(text);
  const isReject = REJECT_PATTERNS.test(text);

  if (!isApprove && !isReject) return false;

  const approval = pendingApprovals[0];
  const decision = isApprove ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;

  await decideApproval({
    approval_id: approval.id,
    decision: decision as any,
    approver_id: input.userId,
    workspace_id: input.workspaceId,
  });

  await notifyTaskEvent({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    task_id: approval.task_id,
    event: isApprove ? 'approval_approved' : 'approval_rejected',
    message: isApprove
      ? 'Approved! I will proceed with the action now.'
      : 'Understood. I have cancelled that action.',
  });

  logger.info('Approval handled via WhatsApp', {
    workspaceId: input.workspaceId,
    approvalId: approval.id,
    taskId: approval.task_id,
    decision,
  });

  return true;
}
