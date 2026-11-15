import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { Checkpoint, CheckpointMetadata, CheckpointTuple } from '@langchain/langgraph';
import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { logger } from '../../config/logger.js';

type KalizaRunnableConfig = { configurable?: Record<string, any> };

export class SupabaseCheckpointSaver extends BaseCheckpointSaver {
  private workspaceId: string;

  constructor(workspaceId: string) {
    super();
    this.workspaceId = workspaceId;
  }

  async getTuple(config: KalizaRunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? '';
    if (!threadId) return undefined;

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('langgraph_checkpoints')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', checkpointNs)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Checkpoint getTuple error', { error: error.message, threadId });
      throw error;
    }
    if (!data) return undefined;

    const stored = data as any;
    const checkpoint = (await this.serde.loadsTyped('json', stored.checkpoint)) as Checkpoint;
    const metadata = stored.metadata as CheckpointMetadata;
    const parentConfig: KalizaRunnableConfig | undefined = stored.parent_checkpoint_id
      ? { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: stored.parent_checkpoint_id } }
      : undefined;

    return {
      config: { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: stored.id } },
      checkpoint,
      metadata,
      parentConfig,
      pendingWrites: [],
    };
  }

  async *list(
    config: KalizaRunnableConfig,
    options?: { filter?: Record<string, unknown>; before?: KalizaRunnableConfig; limit?: number },
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? '';
    if (!threadId) return;

    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('langgraph_checkpoints')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', checkpointNs)
      .order('created_at', { ascending: false });

    if (options?.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error) throw error;

    for (const row of data ?? []) {
      const stored = row as any;
      const checkpoint = (await this.serde.loadsTyped('json', stored.checkpoint)) as Checkpoint;
      yield {
        config: { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: stored.id } },
        checkpoint,
        metadata: stored.metadata as CheckpointMetadata,
        parentConfig: undefined,
        pendingWrites: [],
      };
    }
  }

  async put(config: KalizaRunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<KalizaRunnableConfig> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? '';
    if (!threadId) throw new Error('thread_id is required');

    const serialized = this.serde.dumpsTyped(checkpoint);
    const checkpointId = checkpoint.id;
    const parentId = config.configurable?.checkpoint_id as string | undefined;

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('langgraph_checkpoints').insert({
      workspace_id: this.workspaceId,
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint: typeof serialized === 'string' ? { data: serialized } : { data: String(serialized) },
      metadata: metadata as Record<string, unknown>,
      parent_checkpoint_id: parentId ?? null,
    });

    if (error) {
      logger.error('Checkpoint put error', { error: error.message, threadId });
      throw error;
    }

    return { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId } };
  }

  async putWrites(_config: KalizaRunnableConfig, writes: any[], taskId: string, _taskPath?: string): Promise<void> {
    const threadId = _config.configurable?.thread_id as string;
    const checkpointNs = (_config.configurable?.checkpoint_ns as string) ?? '';
    if (!threadId) throw new Error('thread_id is required');

    const supabase = getSupabaseAdminClient();
    const rows = writes.map((w: any, idx: number) => ({
      workspace_id: this.workspaceId,
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      task_id: taskId,
      idx,
      channel: Array.isArray(w) ? w[0] : String(w),
      value: Array.isArray(w) ? w[2] : w,
    }));

    const { error } = await supabase.from('langgraph_writes').insert(rows);
    if (error) {
      logger.error('Checkpoint putWrites error', { error: error.message, threadId });
      throw error;
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const supabase = getSupabaseAdminClient();
    await supabase.from('langgraph_checkpoints').delete().eq('workspace_id', this.workspaceId).eq('thread_id', threadId);
    await supabase.from('langgraph_writes').delete().eq('workspace_id', this.workspaceId).eq('thread_id', threadId);
  }
}
