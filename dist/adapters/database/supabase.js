import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
let client = null;
export function getSupabaseAdminClient() {
    if (client)
        return client;
    if (!env.supabase.url || !env.supabase.serviceRoleKey) {
        throw new Error('Supabase URL and service role key are required');
    }
    client = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
    return client;
}
export function getSupabaseAnonClient(accessToken) {
    const options = accessToken
        ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        : {};
    return createClient(env.supabase.url, env.supabase.anonKey, options);
}
//# sourceMappingURL=supabase.js.map