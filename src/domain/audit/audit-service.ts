import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { AuditEvent } from '../../contracts/types.js';

export async function recordAuditEvent(input: {
  workspace_id?: string;
  actor: string;
  action: string;
  target?: string;
  target_id?: string;
  correlation_id?: string;
  outcome?: string;
  metadata?: Record<string, unknown>;
}): Promise<AuditEvent> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('audit_events')
    .insert({
      workspace_id: input.workspace_id ?? null,
      actor: input.actor,
      action: input.action,
      target: input.target ?? null,
      target_id: input.target_id ?? null,
      correlation_id: input.correlation_id ?? null,
      outcome: input.outcome ?? 'SUCCESS',
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as AuditEvent;
}

export async function listWorkspaceAuditEvents(
  workspaceId: string,
  limit = 50,
  offset = 0,
): Promise<{ events: AuditEvent[]; total: number }> {
  const supabase = getSupabaseAdminClient();

  const { count, error: countErr } = await supabase
    .from('audit_events')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);

  if (countErr) throw countErr;

  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { events: (data ?? []) as AuditEvent[], total: count ?? 0 };
}
