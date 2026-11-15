import { AgentRunStatus } from '../../config/constants.js';
import { logger } from '../../config/logger.js';
const runs = new Map();
export class StubOrchestrator {
    async createRun(input) {
        const runId = crypto.randomUUID();
        runs.set(runId, { task_id: input.task_id, status: AgentRunStatus.RUNNING, objective: input.objective });
        logger.info('Stub orchestrator: run created', { runId, taskId: input.task_id });
        setTimeout(() => {
            const run = runs.get(runId);
            if (run && run.status === AgentRunStatus.RUNNING) {
                run.status = AgentRunStatus.COMPLETED;
                run.output = { summary: `Completed: ${run.objective}`, steps: [] };
            }
        }, 100);
        return { run_id: runId, task_id: input.task_id, status: AgentRunStatus.RUNNING };
    }
    async resumeRun(input) {
        const run = runs.get(input.run_id);
        if (!run)
            throw new Error(`Run not found: ${input.run_id}`);
        run.status = AgentRunStatus.RUNNING;
        return { run_id: input.run_id, task_id: input.task_id, status: AgentRunStatus.RUNNING };
    }
    async pauseRun(input) {
        const run = runs.get(input.run_id);
        if (run)
            run.status = AgentRunStatus.PAUSED;
    }
    async cancelRun(input) {
        const run = runs.get(input.run_id);
        if (run)
            run.status = AgentRunStatus.CANCELLED;
    }
    async getRun(input) {
        const run = runs.get(input.run_id);
        if (!run)
            throw new Error(`Run not found: ${input.run_id}`);
        return {
            run_id: input.run_id,
            task_id: run.task_id,
            status: run.status,
            output: run.output,
        };
    }
    async *streamEvents(input) {
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
let activeOrchestrator = null;
export function getOrchestrator() {
    if (!activeOrchestrator) {
        activeOrchestrator = new StubOrchestrator();
    }
    return activeOrchestrator;
}
export function setOrchestrator(orch) {
    activeOrchestrator = orch;
}
//# sourceMappingURL=stub-orchestrator.js.map