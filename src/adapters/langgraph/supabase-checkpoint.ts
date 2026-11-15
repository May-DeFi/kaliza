import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { RunnableConfig, Checkpoint, CheckpointMetadata, CheckpointTuple } from '@langchain/langgraph';
import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { logger } from '../../config/logger.js';

interface StoredCheckpoint {
  id: string;
  workspace_id: string;
  thread_id: string;
  checkpoint_ns: string;
  checkpoint: Record<string, unknown>;
  metadata: Record<string, unknown>;
  parent_checkpoint_id: string | null;
  created_at: string;
}

interface StoredWrite {
  id: string;
  thread_id: string;
  checkpoint_ns: string;
  task_id: string;
  idx: number;
  channel: string;
  value: unknown;
}

export class SupabaseCheckpointSaver extends BaseCheckpointSaver {
  private workspaceId: string;

  constructor(workspaceId: string) {
    super();
    this.workspaceId = workspaceId;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? '';
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;

    if (!threadId) return undefined;

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('langgraph_checkpoints')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', checkpointNs)
      .order('created_at', { ascending: false })
      .limit(1);

    if (checkpointId) {
      query = query.eq('parent_checkpoint_id', checkpointId).or(`checkpoint->>id.eq.${checkpointId}`);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      logger.error('Checkpoint getTuple error', { error: error.message, threadId });
      throw error;
    }
    if (!data) return undefined;

    const stored = data as unknown as StoredCheckpoint;
    const checkpoint = await this.serde.loadsTyped('json', stored.checkpoint as unknown as [string, unknown]) as Checkpoint;
    const metadata = stored.metadata as unknown as CheckpointMetadata;

    const parentConfig: RunnableConfig | undefined = stored.parent_checkpoint_id
      ? {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: stored.parent_checkpoint_id,
          },
        }
      : undefined;

    const { data: writesData } = await supabase
      .from('langgraph_writes')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', checkpointNs)
      .eq('task_id', stored.id)
      .order('idx', { ascending: true });

    const pendingWrites = (writesData ?? []).map((w: unknown) => {
      const sw = w as StoredWrite;
      return [sw.task_id, sw.channel, sw.value] as [string, string, unknown];
    });

    return {
      checkpoint,
      metadata,
      parentConfig,
      pendingWrites,
    };
  }

  async *list(
    config: RunnableConfig,
    options?: { filter?: Record<string, unknown>; before?: RunnableConfig; limit?: number },
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

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.before?.configurable?.checkpoint_id) {
      query = query.lt('created_at', options.before.configurable.checkpoint_id);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Checkpoint list error', { error: error.message, threadId });
      throw error;
    }

    for (const row of data ?? []) {
      const stored = row as unknown as StoredCheckpoint;
      const checkpoint = await this.serde.loadsTyped('json', stored.checkpoint as unknown as [string, unknown]) as Checkpoint;
      const metadata = stored.metadata as unknown as CheckpointMetadata;
      const parentConfig: RunnableConfig | undefined = stored.parent_checkpoint_id
        ? { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: stored.parent_checkpoint_id } }
        : undefined;

      yield { checkpoint, metadata, parentConfig, pendingWrites: [] };
    }
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? '';
    if (!threadId) throw new Error('thread_id is required in config');

    const [type, serializedCheckpoint] = this.serde.dumpsTyped(checkpoint);
    const parentId = config.configurable?.checkpoint_id as string | undefined;

    const supabase = getSupabaseAdminClient();
    const checkpointId = checkpoint.id;

    const { error } = await supabase.from('langgraph_checkpoints').insert({
      workspace_id: this.workspaceId,
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      checkpoint: { type, ...((serializedCheckpoint as Record<string, unknown>) ?? {}) },
      metadata: metadata as Record<string, unknown>,
      parent_checkpoint_id: parentId ?? null,
    });

    if (error) {
      logger.error('Checkpoint put error', { error: error.message, threadId });
      throw error;
    }

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: [string, string, unknown][],
    taskId: string,
    taskPath?: string,
  ): Promise<void> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) ?? '';
    if (!threadId) throw new Error('thread_id is required in config');

    const supabase = getSupabaseAdminClient();

    const rows = writes.map(([channel, value], idx) => ({
      workspace_id: this.workspaceId,
      thread_id: threadId,
      checkpoint_ns: checkpointNs,
      task_id: taskId,
      idx,
      channel,
      value: value as unknown,
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
