import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { User } from '../../contracts/types.js';
import { NotFoundError, ConflictError } from '../../api/middleware/errors.js';

export async function findUserByAuthSubject(authSubject: string): Promise<User | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_subject', authSubject)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

export async function getUser(id: string): Promise<User> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('User', id);
  return data as User;
}

export async function createUser(input: {
  auth_subject?: string;
  email?: string;
  phone?: string;
  full_name?: string;
}): Promise<User> {
  const supabase = getSupabaseAdminClient();

  if (input.auth_subject) {
    const existing = await findUserByAuthSubject(input.auth_subject);
    if (existing) throw new ConflictError('User with this auth subject already exists');
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

  if (error) throw error;
  return data as User;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, 'full_name' | 'phone' | 'email' | 'status' | 'profile'>>,
): Promise<User> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('User', id);
  return data as User;
}

export async function findOrCreateUserByPhone(phone: string, fullName?: string): Promise<User> {
  const existing = await findUserByPhone(phone);
  if (existing) return existing;
  return createUser({ phone, full_name: fullName });
}
