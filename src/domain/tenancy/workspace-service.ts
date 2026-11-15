import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { Workspace, Organization, Membership, ServiceEntitlement } from '../../contracts/types.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../api/middleware/errors.js';
import { ServiceId, WorkspaceType, MembershipRole } from '../../config/constants.js';

export async function createOrganization(name: string, ownerId: string): Promise<Organization> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('organizations')
    .insert({ name, owner_id: ownerId })
    .select('*')
    .single();

  if (error) throw error;
  return data as Organization;
}

export async function createWorkspace(input: {
  tenant_id?: string;
  name: string;
  type: string;
  owner_user_id: string;
}): Promise<{ workspace: Workspace; membership: Membership }> {
  const supabase = getSupabaseAdminClient();

  const { data: wsData, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      tenant_id: input.tenant_id ?? null,
      name: input.name,
      type: input.type,
      status: 'ACTIVE',
      settings: {},
    })
    .select('*')
    .single();

  if (wsError) throw wsError;
  const workspace = wsData as Workspace;

  const { data: memData, error: memError } = await supabase
    .from('memberships')
    .insert({
      user_id: input.owner_user_id,
      workspace_id: workspace.id,
      role: MembershipRole.OWNER,
      permissions: [],
    })
    .select('*')
    .single();

  if (memError) throw memError;
  const membership = memData as Membership;

  return { workspace, membership };
}

export async function createIndividualWorkspace(userId: string, name: string): Promise<{ workspace: Workspace; membership: Membership }> {
  return createWorkspace({
    name,
    type: WorkspaceType.INDIVIDUAL,
    owner_user_id: userId,
  });
}

export async function createBusinessWorkspace(input: {
  orgName: string;
  ownerId: string;
  workspaceName?: string;
}): Promise<{ organization: Organization; workspace: Workspace; membership: Membership }> {
  const organization = await createOrganization(input.orgName, input.ownerId);
  const { workspace, membership } = await createWorkspace({
    tenant_id: organization.id,
    name: input.workspaceName ?? input.orgName,
    type: WorkspaceType.BUSINESS,
    owner_user_id: input.ownerId,
  });
  return { organization, workspace, membership };
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('Workspace', id);
  return data as Workspace;
}

export async function listUserWorkspaces(userId: string): Promise<Workspace[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('workspace:workspaces(*)')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((row: unknown) => (row as { workspace: Workspace }).workspace);
}

export async function getWorkspaceMemberships(workspaceId: string): Promise<Membership[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (error) throw error;
  return (data ?? []) as Membership[];
}

export async function addMember(input: {
  workspace_id: string;
  user_id: string;
  role: string;
  permissions?: string[];
}): Promise<Membership> {
  const supabase = getSupabaseAdminClient();

  const { data: existing } = await supabase
    .from('memberships')
    .select('id')
    .eq('workspace_id', input.workspace_id)
    .eq('user_id', input.user_id)
    .maybeSingle();

  if (existing) throw new ConflictError('User is already a member of this workspace');

  const { data, error } = await supabase
    .from('memberships')
    .insert({
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      role: input.role,
      permissions: input.permissions ?? [],
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Membership;
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: string,
): Promise<Membership> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memberships')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('Membership');
  return data as Membership;
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { data: member } = await supabase
    .from('memberships')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member) throw new NotFoundError('Membership');
  if (member.role === MembershipRole.OWNER) {
    throw new ForbiddenError('Cannot remove the workspace owner');
  }

  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getMembership(workspaceId: string, userId: string): Promise<Membership | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as Membership | null;
}

export async function ensureMemberRole(
  workspaceId: string,
  userId: string,
  requiredRoles: string[],
): Promise<Membership> {
  const membership = await getMembership(workspaceId, userId);
  if (!membership) throw new NotFoundError('Membership');
  if (!requiredRoles.includes(membership.role)) {
    throw new ForbiddenError(`Requires role: ${requiredRoles.join(' or ')}`);
  }
  return membership;
}

export async function grantServiceEntitlement(input: {
  workspace_id: string;
  service_id: string;
  plan: string;
  limits?: Record<string, unknown>;
}): Promise<ServiceEntitlement> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('service_entitlements')
    .upsert({
      workspace_id: input.workspace_id,
      service_id: input.service_id,
      plan: input.plan,
      status: 'ACTIVE',
      limits: input.limits ?? {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as ServiceEntitlement;
}

export async function getWorkspaceEntitlements(workspaceId: string): Promise<ServiceEntitlement[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('service_entitlements')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ACTIVE');

  if (error) throw error;
  return (data ?? []) as ServiceEntitlement[];
}

export async function checkServiceEntitlement(
  workspaceId: string,
  serviceId: string,
): Promise<ServiceEntitlement> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('service_entitlements')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('service_id', serviceId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ForbiddenError(`Workspace does not have entitlement for service: ${serviceId}`);
  return data as ServiceEntitlement;
}
