/*
# Phase 2: LangGraph Checkpoint Storage

1. New Tables
- `langgraph_checkpoints` — Stores LangGraph thread checkpoints for agent state persistence and resumption. Thread IDs map to agent run IDs. Workspace-scoped for tenant isolation.
- `langgraph_writes` — Stores intermediate writes/events between checkpoints for full replay capability.

2. Security
- RLS enabled, scoped by workspace membership.
- service_role has full access (Temporal activities and LangGraph runtime use admin client).

3. Indexes
- langgraph_checkpoints.thread_id, langgraph_checkpoints.workspace_id
- langgraph_writes.thread_id
*/

CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint jsonb NOT NULL,
  metadata jsonb DEFAULT '{}',
  parent_checkpoint_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS langgraph_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  task_id text NOT NULL,
  idx int NOT NULL DEFAULT 0,
  channel text NOT NULL,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE langgraph_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph_writes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON langgraph_checkpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON langgraph_writes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON langgraph_checkpoints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON langgraph_writes TO service_role;

DROP POLICY IF EXISTS "select_checkpoint_as_member" ON langgraph_checkpoints;
CREATE POLICY "select_checkpoint_as_member" ON langgraph_checkpoints FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_checkpoints.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_checkpoint_as_member" ON langgraph_checkpoints;
CREATE POLICY "insert_checkpoint_as_member" ON langgraph_checkpoints FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_checkpoints.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_checkpoint_as_member" ON langgraph_checkpoints;
CREATE POLICY "update_checkpoint_as_member" ON langgraph_checkpoints FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_checkpoints.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_checkpoints.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_checkpoint_as_member" ON langgraph_checkpoints;
CREATE POLICY "delete_checkpoint_as_member" ON langgraph_checkpoints FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_checkpoints.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "select_write_as_member" ON langgraph_writes;
CREATE POLICY "select_write_as_member" ON langgraph_writes FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_writes.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_write_as_member" ON langgraph_writes;
CREATE POLICY "insert_write_as_member" ON langgraph_writes FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_writes.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_write_as_member" ON langgraph_writes;
CREATE POLICY "update_write_as_member" ON langgraph_writes FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_writes.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_writes.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_write_as_member" ON langgraph_writes;
CREATE POLICY "delete_write_as_member" ON langgraph_writes FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = langgraph_writes.workspace_id AND user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_langgraph_checkpoint_thread_id ON langgraph_checkpoints(thread_id);
CREATE INDEX IF NOT EXISTS idx_langgraph_checkpoint_workspace_id ON langgraph_checkpoints(workspace_id);
CREATE INDEX IF NOT EXISTS idx_langgraph_writes_thread_id ON langgraph_writes(thread_id);

-- Also add temporal_workflow_id column to agent_runs for cross-referencing
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS temporal_workflow_id text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS temporal_run_id text;
