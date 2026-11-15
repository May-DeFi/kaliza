import { getSupabaseAdminClient } from '../database/supabase.js';
import { logger } from '../../config/logger.js';
export async function enqueue(input) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('job_queue')
        .insert({
        job_type: input.job_type,
        payload: input.payload,
        workspace_id: input.workspace_id ?? null,
        status: 'PENDING',
        priority: input.priority ?? 5,
        attempts: 0,
        max_attempts: input.max_attempts ?? 3,
        available_at: input.available_at ?? new Date().toISOString(),
    })
        .select('*')
        .single();
    if (error)
        throw error;
    return data;
}
export async function dequeue(jobType) {
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    let query = supabase
        .from('job_queue')
        .select('*')
        .eq('status', 'PENDING')
        .lte('available_at', now)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1);
    if (jobType) {
        query = query.eq('job_type', jobType);
    }
    const { data: jobs, error: fetchErr } = await query;
    if (fetchErr)
        throw fetchErr;
    if (!jobs || jobs.length === 0)
        return null;
    const job = jobs[0];
    const { data: claimed, error: claimErr } = await supabase
        .from('job_queue')
        .update({
        status: 'PROCESSING',
        attempts: job.attempts + 1,
        updated_at: now,
    })
        .eq('id', job.id)
        .eq('status', 'PENDING')
        .select('*')
        .maybeSingle();
    if (claimErr)
        throw claimErr;
    if (!claimed)
        return null;
    return claimed;
}
export async function completeJob(jobId) {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
        .from('job_queue')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('id', jobId);
    if (error)
        throw error;
}
export async function failJob(jobId, errorMessage) {
    const supabase = getSupabaseAdminClient();
    const { data: job } = await supabase
        .from('job_queue')
        .select('attempts, max_attempts')
        .eq('id', jobId)
        .maybeSingle();
    if (!job)
        return;
    if (job.attempts >= job.max_attempts) {
        const { error } = await supabase
            .from('job_queue')
            .update({ status: 'DEAD_LETTER', error_message: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error)
            throw error;
        logger.warn('Job moved to dead-letter queue', { jobId, attempts: job.attempts, error: errorMessage });
    }
    else {
        const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 60000);
        const availableAt = new Date(Date.now() + backoffMs).toISOString();
        const { error } = await supabase
            .from('job_queue')
            .update({ status: 'PENDING', error_message: errorMessage, available_at: availableAt, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error)
            throw error;
        logger.info('Job requeued with backoff', { jobId, attempts: job.attempts, backoffMs });
    }
}
export async function getQueueDepth(jobType) {
    const supabase = getSupabaseAdminClient();
    let query = supabase
        .from('job_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
    if (jobType) {
        query = query.eq('job_type', jobType);
    }
    const { count, error } = await query;
    if (error)
        throw error;
    return count ?? 0;
}
//# sourceMappingURL=job-queue.js.map