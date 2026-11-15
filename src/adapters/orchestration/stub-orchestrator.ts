import type {
  AgentOrchestrator,
  CreateRunInput,
  RunReference,
  ResumeRunInput,
  PauseRunInput,
  CancelRunInput,
  GetRunInput,
  StreamRunInput,
  RunSnapshot,
  RunEvent,
} from '../../domain/agents/orchestrator.js';
import { AgentRunStatus } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

const runs = new Map<string, { task_id: string; status: string; objective: string; output?: Record<string, unknown> }>();

export class StubOrchestrator implements AgentOrchestrator {
  async createRun(input: CreateRunInput): Promise<RunReference> {
    const runId = crypto.randomUUID();
    runs.set(runId, { task_id: input.task_id, status: AgentRunStatus.RUNNING, objective: input.objective });

    logger.warn('STUB ORCHESTRATOR: creating simulated run — this is NOT a real agent execution', { runId, taskId: input.task_id });

    setTimeout(() => {
      const run = runs.get(runId);
      if (run && run.status === AgentRunStatus.RUNNING) {
        run.status = AgentRunStatus.COMPLETED;
        run.output = { summary: `Completed: ${run.objective}`, steps: [] };
      }
    }, 100);

    return { run_id: runId, task_id: input.task_id, status: AgentRunStatus.RUNNING };
  }

  async resumeRun(input: ResumeRunInput): Promise<RunReference> {
    const run = runs.get(input.run_id);
    if (!run) throw new Error(`Run not found: ${input.run_id}`);
    run.status = AgentRunStatus.RUNNING;
    return { run_id: input.run_id, task_id: input.task_id, status: AgentRunStatus.RUNNING };
  }

  async pauseRun(input: PauseRunInput): Promise<void> {
    const run = runs.get(input.run_id);
    if (run) run.status = AgentRunStatus.PAUSED;
  }

  async cancelRun(input: CancelRunInput): Promise<void> {
    const run = runs.get(input.run_id);
    if (run) run.status = AgentRunStatus.CANCELLED;
  }

  async getRun(input: GetRunInput): Promise<RunSnapshot> {
    const run = runs.get(input.run_id);
    if (!run) throw new Error(`Run not found: ${input.run_id}`);
    return {
      run_id: input.run_id,
      task_id: run.task_id,
      status: run.status as AgentRunStatusValue,
      output: run.output,
    };
  }

  async *streamEvents(input: StreamRunInput): AsyncIterable<RunEvent> {
    yield {
      type: 'run.started',
      run_id: input.run_id,
      task_id: runs.get(input.run_id)?.task_id ?? '',
      timestamp: new Date().toISOString(),
    };
    yield {
      type: 'run.completed',
      run_id: input.run_id,
      task_id: runs.get(input.run_id)?.task_id ?? '',
      timestamp: new Date().toISOString(),
    };
  }
}

let activeOrchestrator: AgentOrchestrator | null = null;

export function getOrchestrator(): AgentOrchestrator {
  if (activeOrchestrator) return activeOrchestrator;

  if (env.runtime.mode === 'production') {
    throw new Error(
      'Production runtime mode requires a real Temporal server. Set KALIZA_RUNTIME_MODE=development for testing or configure Temporal and restart.',
    );
  }

  logger.warn('Using StubOrchestrator — simulated agent execution. This must not be used in production.');
  activeOrchestrator = new StubOrchestrator();
  return activeOrchestrator;
}

export function setOrchestrator(orch: AgentOrchestrator): void {
  activeOrchestrator = orch;
}

