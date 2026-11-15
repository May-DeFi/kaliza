import type { AgentRunStatusValue } from '../../config/constants.js';
import { AgentRunStatus } from '../../config/constants.js';

export interface CreateRunInput {
  task_id: string;
  workspace_id: string;
  service_id: string;
  objective: string;
  context_references?: string[];
  tool_allowlist?: string[];
  budget_limit_tokens?: number;
  model_policy?: Record<string, unknown>;
}

export interface RunReference {
  run_id: string;
  task_id: string;
  status: AgentRunStatusValue;
}

export interface ResumeRunInput {
  run_id: string;
  task_id: string;
  user_input?: string;
  approved_action?: Record<string, unknown>;
}

export interface PauseRunInput {
  run_id: string;
  task_id: string;
}

export interface CancelRunInput {
  run_id: string;
  task_id: string;
}

export interface GetRunInput {
  run_id: string;
}

export interface StreamRunInput {
  run_id: string;
}

export interface RunSnapshot {
  run_id: string;
  task_id: string;
  status: AgentRunStatusValue;
  current_step?: string;
  steps_completed?: number;
  steps_total?: number;
  output?: Record<string, unknown>;
  error?: string;
}

export interface RunEvent {
  type: string;
  run_id: string;
  task_id: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface AgentOrchestrator {
  createRun(input: CreateRunInput): Promise<RunReference>;
  resumeRun(input: ResumeRunInput): Promise<RunReference>;
  pauseRun(input: PauseRunInput): Promise<void>;
  cancelRun(input: CancelRunInput): Promise<void>;
  getRun(input: GetRunInput): Promise<RunSnapshot>;
  streamEvents(input: StreamRunInput): AsyncIterable<RunEvent>;
}
