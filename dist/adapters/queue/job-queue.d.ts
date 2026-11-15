export interface QueuedJob {
    id: string;
    job_type: string;
    payload: Record<string, unknown>;
    status: string;
    attempts: number;
    max_attempts: number;
    available_at: string;
}
export declare function enqueue(input: {
    job_type: string;
    payload: Record<string, unknown>;
    workspace_id?: string;
    priority?: number;
    max_attempts?: number;
    available_at?: string;
}): Promise<QueuedJob>;
export declare function dequeue(jobType?: string): Promise<QueuedJob | null>;
export declare function completeJob(jobId: string): Promise<void>;
export declare function failJob(jobId: string, errorMessage: string): Promise<void>;
export declare function getQueueDepth(jobType?: string): Promise<number>;
//# sourceMappingURL=job-queue.d.ts.map