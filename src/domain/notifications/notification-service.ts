import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { logger } from '../../config/logger.js';
import { metaAdapter } from '../../adapters/meta/meta-adapter.js';
import { isPlaceholder } from '../../config/env.js';

export interface NotificationInput {
  workspace_id: string;
  user_id?: string;
  type: string;
  channel?: string;
  title?: string;
  content: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: NotificationInput): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('notifications').insert({
    workspace_id: input.workspace_id,
    user_id: input.user_id ?? null,
    type: input.type,
    channel: input.channel ?? 'WHATSAPP',
    title: input.title ?? null,
    content: input.content,
    task_id: input.task_id ?? null,
    metadata: input.metadata ?? {},
    delivery_state: 'PENDING',
  });

  if (error) throw error;
}

export async function getPendingNotifications(limit = 50): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('delivery_state', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

export async function deliverNotification(notification: Record<string, unknown>): Promise<void> {
  const channel = notification.channel as string;
  const notificationId = notification.id as string;
  const content = notification.content as string;
  const userId = notification.user_id as string | null;

  if (channel === 'WHATSAPP' && userId) {
    const phone = await getUserPhone(userId);
    if (phone) {
      try {
        if (isPlaceholder('placeholder')) {
          logger.info('Notification delivery (stub mode)', { notificationId, channel, phone });
        } else {
          await metaAdapter.sendWhatsAppMessage({ to: phone, text: content });
        }
        await markDelivered(notificationId, 'DELIVERED');
      } catch (err) {
        await markRetry(notificationId, err instanceof Error ? err.message : String(err));
      }
    } else {
      await markDelivered(notificationId, 'NO_PHONE');
    }
  } else {
    await markDelivered(notificationId, 'WEB_ONLY');
  }
}

async function getUserPhone(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('phone')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.phone ?? null;
}

async function markDelivered(notificationId: string, state: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase
    .from('notifications')
    .update({ delivery_state: state, updated_at: new Date().toISOString() })
    .eq('id', notificationId);
}

async function markRetry(notificationId: string, error: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('notifications')
    .select('retry_count, max_retries')
    .eq('id', notificationId)
    .maybeSingle();

  if (!data) return;

  if (data.retry_count >= data.max_retries) {
    await supabase
      .from('notifications')
      .update({ delivery_state: 'FAILED', updated_at: new Date().toISOString() })
      .eq('id', notificationId);
  } else {
    await supabase
      .from('notifications')
      .update({ retry_count: data.retry_count + 1, delivery_state: 'PENDING', metadata: { last_error: error }, updated_at: new Date().toISOString() })
      .eq('id', notificationId);
  }
}

export async function notifyTaskEvent(input: {
  workspace_id: string;
  user_id?: string;
  task_id: string;
  event: string;
  message: string;
}): Promise<void> {
  await createNotification({
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    type: `task.${input.event}`,
    content: input.message,
    task_id: input.task_id,
  });
}

export async function listWorkspaceNotifications(workspaceId: string, limit = 50): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}
