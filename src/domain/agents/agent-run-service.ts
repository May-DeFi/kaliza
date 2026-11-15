import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import type { AgentRun } from '../../contracts/types.js';
import { NotFoundError } from '../../api/middleware/errors.js';
import { AgentRunStatus, type AgentRunStatusValue } from '../../config/constants.js';
import { getOrchestrator } from '../../adapters/orchestration/stub-orchestrator.js';
import type { CreateRunInput, RunSnapshot } from './orchestrator.js';

export async function createAgentRun(input: CreateRunInput): Promise<{ agentRun: AgentRun; runReference: { run_id: string; task_id: string; status: string } }> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('agent_runs')
    .insert({
      task_id: input.task_id,
      orchestrator: 'kaliza-default',
      status: AgentRunStatus.CREATED,
      trace_metadata: {},
    })
    .select('*')
    .single();

  if (error) throw error;
  const agentRun = data as AgentRun;

  const orchestrator = getOrchestrator();
  const runRef = await orchestrator.createRun(input);

  const { error: updateErr } = await supabase
    .from('agent_runs')
    .update({
      external_run_id: runRef.run_id,
      status: AgentRunStatus.RUNNING,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentRun.id);

  if (updateErr) throw updateErr;

  return { agentRun: { ...agentRun, external_run_id: runRef.run_id, status: AgentRunStatus.RUNNING }, runReference: runRef };
}

export async function getAgentRun(id: string): Promise<AgentRun> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new NotFoundError('AgentRun', id);
  return data as AgentRun;
}

export async function listTaskAgentRuns(taskId: string): Promise<AgentRun[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AgentRun[];
}

export async function pauseAgentRun(agentRunId: string): Promise<AgentRun> {
  const agentRun = await getAgentRun(agentRunId);
  const orchestrator = getOrchestrator();

  if (agentRun.external_run_id) {
    await orchestrator.pauseRun({ run_id: agentRun.external_run_id, task_id: agentRun.task_id });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .update({ status: AgentRunStatus.PAUSED, updated_at: new Date().toISOString() })
    .eq('id', agentRunId)
    .select('*')
    .single();

  if (error) throw error;
  return data as AgentRun;
}

export async function cancelAgentRun(agentRunId: string): Promise<AgentRun> {
  const agentRun = await getAgentRun(agentRunId);
  const orchestrator = getOrchestrator();

  if (agentRun.external_run_id) {
    await orchestrator.cancelRun({ run_id: agentRun.external_run_id, task_id: agentRun.task_id });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .update({ status: AgentRunStatus.CANCELLED, updated_at: new Date().toISOString() })
    .eq('id', agentRunId)
    .select('*')
    .single();

  if (error) throw error;
  return data as AgentRun;
}

export async function resumeAgentRun(agentRunId: string, userInput?: string): Promise<AgentRun> {
  const agentRun = await getAgentRun(agentRunId);
  const orchestrator = getOrchestrator();

  if (agentRun.external_run_id) {
    await orchestrator.resumeRun({ run_id: agentRun.external_run_id, task_id: agentRun.task_id, user_input: userInput });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('agent_runs')
    .update({ status: AgentRunStatus.RUNNING, updated_at: new Date().toISOString() })
    .eq('id', agentRunId)
    .select('*')
    .single();

  if (error) throw error;
  return data as AgentRun;
}

export async function getRunSnapshot(agentRunId: string): Promise<RunSnapshot> {
  const agentRun = await getAgentRun(agentRunId);
  if (!agentRun.external_run_id) throw new NotFoundError('External run');
  const orchestrator = getOrchestrator();
  return orchestrator.getRun({ run_id: agentRun.external_run_id });
}
