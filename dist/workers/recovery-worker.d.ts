export declare function runRecoveryCycle(): Promise<{
    stuck_tasks_reset: number;
    sandboxes_paused: number;
    sandboxes_terminated: number;
    approvals_expired: number;
}>;
export declare function startRecoveryWorker(): Promise<void>;
export declare function stopRecoveryWorker(): void;
//# sourceMappingURL=recovery-worker.d.ts.map