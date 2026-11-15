import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { getDaytonaAdapter } from '../../adapters/daytona/daytona-adapter.js';
import type { SandboxInstance } from '../../contracts/types.js';
import { SandboxStatus, type SandboxStatusValue } from '../../config/constants.js';
import { NotFoundError, ConflictError } from '../../api/middleware/errors.js';
import { logger } from '../../config/logger.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RESOURCE_LIMITS = { cpu: 2, memory: 4, disk: 10 };

export async function provisionSandbox(input: {
  workspace_id: string;
  task_id?: string;
  image?: string;
  resource_limits?: Record<string, unknown>;
}): Promise<SandboxInstance> {
  const supabase = getSupabaseAdminClient();
  const daytona = getDaytonaAdapter();

  const { data: dbRecord, error: dbErr } = await supabase
    .from('sandbox_instances')
    .insert({
      workspace_id: input.workspace_id,
      task_id: input.task_id ?? null,
      image: input.image ?? 'ubuntu:22.04',
      status: SandboxStatus.PROVISIONING,
      resource_limits: input.resource_limits ?? DEFAULT_RESOURCE_LIMITS,
      last_activity: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (dbErr) throw dbErr;
  const sandbox = dbRecord as unknown as SandboxInstance;

  try {
    const daytonaSandbox = await daytona.provision({
      image: input.image,
      cpu: (input.resource_limits?.cpu as number) ?? 2,
      memory: (input.resource_limits?.memory as number) ?? 4,
      disk: (input.resource_limits?.disk as number) ?? 10,
    });

    const leaseExpiry = new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString();

    const { data: updated, error: updateErr } = await supabase
      .from('sandbox_instances')
      .update({
        daytona_id: daytonaSandbox.id,
        status: SandboxStatus.READY,
        lease_expiry: leaseExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sandbox.id)
      .select('*')
      .single();

    if (updateErr) throw updateErr;
    logger.info('Sandbox provisioned', { sandboxId: sandbox.id, daytonaId: daytonaSandbox.id });
    return updated as unknown as SandboxInstance;
  } catch (err) {
    await supabase
      .from('sandbox_instances')
      .update({ status: SandboxStatus.FAILED, updated_at: new Date().toISOString() })
      .eq('id', sandbox.id);
    throw err;
  }
}

export async function getSandbox(id: string): Promise<SandboxInstance> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('sandbox_instances')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('Sandbox', id);
  return data as unknown as SandboxInstance;
}

export async function executeInSandbox(input: {
  sandbox_id: string;
  command: string;
  timeout_ms?: number;
}): Promise<{ exit_code: number; stdout: string; stderr: string; duration_ms: number }> {
  const sandbox = await getSandbox(input.sandbox_id);
  if (sandbox.status !== SandboxStatus.READY && sandbox.status !== SandboxStatus.ACTIVE) {
    throw new ConflictError(`Sandbox is not ready (status: ${sandbox.status})`);
  }

  const daytona = getDaytonaAdapter();
  const result = await daytona.execute({
    sandboxId: sandbox.daytona_id ?? '',
    command: input.command,
    timeout_ms: input.timeout_ms,
  });

  const supabase = getSupabaseAdminClient();
  await supabase
    .from('sandbox_instances')
    .update({ last_activity: new Date().toISOString(), status: SandboxStatus.ACTIVE, updated_at: new Date().toISOString() })
    .eq('id', input.sandbox_id);

  return result;
}

export async function pauseSandbox(sandboxId: string): Promise<SandboxInstance> {
  const sandbox = await getSandbox(sandboxId);
  const daytona = getDaytonaAdapter();

  if (sandbox.daytona_id) {
    await daytona.pause(sandbox.daytona_id);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('sandbox_instances')
    .update({ status: SandboxStatus.PAUSED, updated_at: new Date().toISOString() })
    .eq('id', sandboxId)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as SandboxInstance;
}

export async function resumeSandbox(sandboxId: string): Promise<SandboxInstance> {
  const sandbox = await getSandbox(sandboxId);
  const daytona = getDaytonaAdapter();

  if (sandbox.daytona_id) {
    await daytona.resume(sandbox.daytona_id);
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('sandbox_instances')
    .update({ status: SandboxStatus.ACTIVE, last_activity: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', sandboxId)
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as SandboxInstance;
}

export async function terminateSandbox(sandboxId: string): Promise<void> {
  const sandbox = await getSandbox(sandboxId);
  const daytona = getDaytonaAdapter();

  if (sandbox.daytona_id) {
    await daytona.terminate(sandbox.daytona_id);
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('sandbox_instances')
    .update({ status: SandboxStatus.PURGED, updated_at: new Date().toISOString() })
    .eq('id', sandboxId);

  if (error) throw error;
}

export async function listWorkspaceSandboxes(workspaceId: string): Promise<SandboxInstance[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('sandbox_instances')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as SandboxInstance[];
}

export async function findIdleSandboxes(): Promise<SandboxInstance[]> {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - IDLE_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from('sandbox_instances')
    .select('*')
    .in('status', [SandboxStatus.ACTIVE, SandboxStatus.READY])
    .lt('last_activity', cutoff);

  if (error) throw error;
  return (data ?? []) as unknown as SandboxInstance[];
}

export async function findExpiredSandboxes(): Promise<SandboxInstance[]> {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - MAX_LIFETIME_MS).toISOString();

  const { data, error } = await supabase
    .from('sandbox_instances')
    .select('*')
    .in('status', [SandboxStatus.ACTIVE, SandboxStatus.READY, SandboxStatus.PAUSED])
    .lt('created_at', cutoff);

  if (error) throw error;
  return (data ?? []) as unknown as SandboxInstance[];
}

export async function reconcileSandboxLifecycles(): Promise<{
  paused: number;
  terminated: number;
}> {
  const idle = await findIdleSandboxes();
  let paused = 0;
  for (const sandbox of idle) {
    try {
      await pauseSandbox(sandbox.id);
      paused++;
    } catch (err) {
      logger.error('Failed to pause idle sandbox', { sandboxId: sandbox.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const expired = await findExpiredSandboxes();
  let terminated = 0;
  for (const sandbox of expired) {
    try {
      await terminateSandbox(sandbox.id);
      terminated++;
    } catch (err) {
      logger.error('Failed to terminate expired sandbox', { sandboxId: sandbox.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (paused > 0 || terminated > 0) {
    logger.info('Sandbox lifecycle reconciliation complete', { paused, terminated });
  }

  return { paused, terminated };
}
