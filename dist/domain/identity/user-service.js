import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { NotFoundError, ConflictError } from '../../api/middleware/errors.js';
export async function findUserByAuthSubject(authSubject) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_subject', authSubject)
        .maybeSingle();
    if (error)
        throw error;
    return data;
}
export async function findUserByPhone(phone) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
    if (error)
        throw error;
    return data;
}
export async function findUserByEmail(email) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
    if (error)
        throw error;
    return data;
}
export async function getUser(id) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new NotFoundError('User', id);
    return data;
}
export async function createUser(input) {
    const supabase = getSupabaseAdminClient();
    if (input.auth_subject) {
        const existing = await findUserByAuthSubject(input.auth_subject);
        if (existing)
            throw new ConflictError('User with this auth subject already exists');
    }
    const { data, error } = await supabase
        .from('users')
        .insert({
        auth_subject: input.auth_subject ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        full_name: input.full_name ?? null,
        status: 'ACTIVE',
        profile: {},
    })
        .select('*')
        .single();
    if (error)
        throw error;
    return data;
}
export async function updateUser(id, updates) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new NotFoundError('User', id);
    return data;
}
export async function findOrCreateUserByPhone(phone, fullName) {
    const existing = await findUserByPhone(phone);
    if (existing)
        return existing;
    return createUser({ phone, full_name: fullName });
}
//# sourceMappingURL=user-service.js.map