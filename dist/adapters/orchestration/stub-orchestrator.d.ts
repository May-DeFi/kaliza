import type { AgentOrchestrator, CreateRunInput, RunReference, ResumeRunInput, PauseRunInput, CancelRunInput, GetRunInput, StreamRunInput, RunSnapshot, RunEvent } from '../../domain/agents/orchestrator.js';
export declare class StubOrchestrator implements AgentOrchestrator {
    createRun(input: CreateRunInput): Promise<RunReference>;
    resumeRun(input: ResumeRunInput): Promise<RunReference>;
    pauseRun(input: PauseRunInput): Promise<void>;
    cancelRun(input: CancelRunInput): Promise<void>;
    getRun(input: GetRunInput): Promise<RunSnapshot>;
    streamEvents(input: StreamRunInput): AsyncIterable<RunEvent>;
}
export declare function getOrchestrator(): AgentOrchestrator;
export declare function setOrchestrator(orch: AgentOrchestrator): void;
//# sourceMappingURL=stub-orchestrator.d.ts.map