import type { AgentRun } from '../../contracts/types.js';
import type { CreateRunInput, RunSnapshot } from './orchestrator.js';
export declare function createAgentRun(input: CreateRunInput): Promise<{
    agentRun: AgentRun;
    runReference: {
        run_id: string;
        task_id: string;
        status: string;
    };
}>;
export declare function getAgentRun(id: string): Promise<AgentRun>;
export declare function listTaskAgentRuns(taskId: string): Promise<AgentRun[]>;
export declare function pauseAgentRun(agentRunId: string): Promise<AgentRun>;
export declare function cancelAgentRun(agentRunId: string): Promise<AgentRun>;
export declare function resumeAgentRun(agentRunId: string, userInput?: string): Promise<AgentRun>;
export declare function getRunSnapshot(agentRunId: string): Promise<RunSnapshot>;
//# sourceMappingURL=agent-run-service.d.ts.map