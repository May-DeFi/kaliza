import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { Conversation, Message } from '../../contracts/types.js';
import { NotFoundError, ConflictError } from '../../api/middleware/errors.js';
import { ConversationChannel, MessageDirection } from '../../config/constants.js';

export async function getOrCreateConversation(input: {
  workspace_id: string;
  channel: string;
  external_thread_id: string;
  user_id?: string;
}): Promise<Conversation> {
  const supabase = getSupabaseAdminClient();

  const { data: existing, error: findErr } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', input.workspace_id)
    .eq('channel', input.channel)
    .eq('external_thread_id', input.external_thread_id)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing as Conversation;

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: input.workspace_id,
      channel: input.channel,
      external_thread_id: input.external_thread_id,
      status: 'ACTIVE',
      user_id: input.user_id ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function getConversation(id: string): Promise<Conversation> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('Conversation', id);
  return data as Conversation;
}

export async function listWorkspaceConversations(workspaceId: string): Promise<Conversation[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function addMessage(input: {
  conversation_id: string;
  direction: string;
  content?: string;
  content_type?: string;
  attachments?: Record<string, unknown>[];
  provider_message_id?: string;
  delivery_state?: string;
}): Promise<Message> {
  const supabase = getSupabaseAdminClient();

  if (input.provider_message_id) {
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('provider_message_id', input.provider_message_id)
      .maybeSingle();

    if (existing) throw new ConflictError('Duplicate provider message');
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: input.conversation_id,
      direction: input.direction,
      content: input.content ?? null,
      content_type: input.content_type ?? 'TEXT',
      attachments: input.attachments ?? [],
      provider_message_id: input.provider_message_id ?? null,
      delivery_state: input.delivery_state ?? 'PENDING',
    })
    .select('*')
    .single();

  if (error) throw error;

  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversation_id);

  return data as Message;
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function updateMessageDelivery(
  providerMessageId: string,
  deliveryState: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('messages')
    .update({ delivery_state: deliveryState, updated_at: new Date().toISOString() })
    .eq('provider_message_id', providerMessageId);

  if (error) throw error;
}

export { ConversationChannel, MessageDirection };
