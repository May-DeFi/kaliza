import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
export async function deduplicateWebhook(provider, eventId) {
    const supabase = getSupabaseAdminClient();
    const { data: existing } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('provider', provider)
        .eq('event_id', eventId)
        .maybeSingle();
    if (existing)
        return false;
    const { error } = await supabase.from('webhook_events').insert({
        provider,
        event_id: eventId,
        event_type: 'UNKNOWN',
        processed: false,
    });
    if (error) {
        if (error.code === '23505')
            return false;
        throw error;
    }
    return true;
}
export async function markWebhookProcessed(provider, eventId, eventType, payloadRef) {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
        .from('webhook_events')
        .update({
        processed: true,
        event_type: eventType,
        payload_ref: payloadRef ?? null,
        updated_at: new Date().toISOString(),
    })
        .eq('provider', provider)
        .eq('event_id', eventId);
    if (error)
        throw error;
}
export async function listPendingWebhooks(limit = 50) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('processed', false)
        .order('created_at', { ascending: true })
        .limit(limit);
    if (error)
        throw error;
    return (data ?? []);
}
//# sourceMappingURL=webhook-service.js.map