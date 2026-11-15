/*
# Phase 2: Conversations, Tasks, Audit, Webhooks, Files

1. New Tables
- `conversations` — Channel-neutral conversations tied to a workspace. Tracks channel (WHATSAPP/WEB), external thread ID, status, and the user who owns it.
- `messages` — Individual messages within a conversation. Direction (INBOUND/OUTBOUND), content, content_type, attachments JSON, provider message ID for deduplication, delivery state.
- `tasks` — Durable task records. Carries workspace_id, service_id, conversation_id, objective, status (state machine), priority, idempotency_key, version for optimistic locking.
- `task_steps` — Individual steps within a task. Sequence, step_type, status, input/output references, metadata.
- `task_transitions` — Append-only audit log of task state transitions. Records from/to status, actor, reason, task version, run reference.
- `audit_events` — Platform-wide immutable audit log. Actor, action, target, correlation ID, outcome, metadata.
- `webhook_events` — Inbound webhook deduplication and processing state. Provider, event ID, event type, processed flag, payload reference.
- `file_assets` — File metadata (bytes stored in object storage). Workspace ownership, object key, mime type, size, checksum, source, access policy, optional task link.

2. Relationships
- conversations.workspace_id -> workspaces.id, conversations.user_id -> users.id
- messages.conversation_id -> conversations.id
- tasks.workspace_id -> workspaces.id, tasks.conversation_id -> conversations.id, tasks.user_id -> users.id
- task_steps.task_id -> tasks.id
- task_transitions.task_id -> tasks.id
- audit_events.workspace_id -> workspaces.id (nullable for platform-level events)
- file_assets.workspace_id -> workspaces.id, file_assets.task_id -> tasks.id

3. Security
- RLS enabled on all tables.
- Grants to authenticated + service_role.
- All tenant-owned tables scoped by workspace membership via EXISTS subquery on memberships.
- task_transitions is INSERT-only (no UPDATE/DELETE grant to authenticated) — append-only history.
- audit_events is INSERT-only for authenticated; service_role retains full access.
- webhook_events accessible only to service_role (internal infra, not user-facing).

4. Indexes on all frequently-queried columns.
*/

-- ============ TABLES FIRST ============

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'WHATSAPP',
  external_thread_id text,
  status text NOT NULL DEFAULT 'ACTIVE',
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'INBOUND',
  content text,
  content_type text NOT NULL DEFAULT 'TEXT',
  attachments jsonb DEFAULT '[]',
  provider_message_id text UNIQUE,
  delivery_state text DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  service_id text,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED',
  priority int NOT NULL DEFAULT 5,
  idempotency_key text,
  version int NOT NULL DEFAULT 1,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence int NOT NULL DEFAULT 0,
  step_type text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  input_ref text,
  output_ref text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  actor text NOT NULL,
  reason text,
  task_version int NOT NULL,
  run_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  target text,
  target_id text,
  correlation_id text,
  outcome text NOT NULL DEFAULT 'SUCCESS',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  payload_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

CREATE TABLE IF NOT EXISTS file_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum text,
  source text NOT NULL DEFAULT 'UPLOAD',
  access_policy text NOT NULL DEFAULT 'PRIVATE',
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS ============

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_assets ENABLE ROW LEVEL SECURITY;

-- ============ GRANTS ============

GRANT SELECT, INSERT, UPDATE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO service_role;

GRANT SELECT, INSERT, UPDATE ON messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO service_role;

GRANT SELECT, INSERT, UPDATE ON tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO service_role;

GRANT SELECT, INSERT, UPDATE ON task_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_steps TO service_role;

GRANT SELECT, INSERT ON task_transitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_transitions TO service_role;

GRANT SELECT, INSERT ON audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO service_role;

GRANT SELECT, INSERT, UPDATE ON file_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON file_assets TO service_role;

-- ============ POLICIES: conversations ============

DROP POLICY IF EXISTS "select_conversation_as_member" ON conversations;
CREATE POLICY "select_conversation_as_member" ON conversations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = conversations.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_conversation_as_member" ON conversations;
CREATE POLICY "insert_conversation_as_member" ON conversations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = conversations.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_conversation_as_member" ON conversations;
CREATE POLICY "update_conversation_as_member" ON conversations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = conversations.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = conversations.workspace_id AND user_id = auth.uid())
  );

-- ============ POLICIES: messages ============

DROP POLICY IF EXISTS "select_message_as_member" ON messages;
CREATE POLICY "select_message_as_member" ON messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN memberships m ON m.workspace_id = c.workspace_id
      WHERE c.id = messages.conversation_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_message_as_member" ON messages;
CREATE POLICY "insert_message_as_member" ON messages FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN memberships m ON m.workspace_id = c.workspace_id
      WHERE c.id = messages.conversation_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_message_as_member" ON messages;
CREATE POLICY "update_message_as_member" ON messages FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN memberships m ON m.workspace_id = c.workspace_id
      WHERE c.id = messages.conversation_id AND m.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN memberships m ON m.workspace_id = c.workspace_id
      WHERE c.id = messages.conversation_id AND m.user_id = auth.uid()
    )
  );

-- ============ POLICIES: tasks ============

DROP POLICY IF EXISTS "select_task_as_member" ON tasks;
CREATE POLICY "select_task_as_member" ON tasks FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_task_as_member" ON tasks;
CREATE POLICY "insert_task_as_member" ON tasks FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_task_as_member" ON tasks;
CREATE POLICY "update_task_as_member" ON tasks FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tasks.workspace_id AND user_id = auth.uid())
  );

-- ============ POLICIES: task_steps ============

DROP POLICY IF EXISTS "select_task_step_as_member" ON task_steps;
CREATE POLICY "select_task_step_as_member" ON task_steps FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = task_steps.task_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_task_step_as_member" ON task_steps;
CREATE POLICY "insert_task_step_as_member" ON task_steps FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = task_steps.task_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_task_step_as_member" ON task_steps;
CREATE POLICY "update_task_step_as_member" ON task_steps FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = task_steps.task_id AND m.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = task_steps.task_id AND m.user_id = auth.uid()
    )
  );

-- ============ POLICIES: task_transitions ============

DROP POLICY IF EXISTS "select_task_transition_as_member" ON task_transitions;
CREATE POLICY "select_task_transition_as_member" ON task_transitions FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = task_transitions.task_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_task_transition_as_member" ON task_transitions;
CREATE POLICY "insert_task_transition_as_member" ON task_transitions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = task_transitions.task_id AND m.user_id = auth.uid()
    )
  );

-- ============ POLICIES: audit_events ============

DROP POLICY IF EXISTS "select_audit_as_member" ON audit_events;
CREATE POLICY "select_audit_as_member" ON audit_events FOR SELECT
  TO authenticated USING (
    workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM memberships WHERE workspace_id = audit_events.workspace_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_audit_as_member" ON audit_events;
CREATE POLICY "insert_audit_as_member" ON audit_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============ POLICIES: file_assets ============

DROP POLICY IF EXISTS "select_file_as_member" ON file_assets;
CREATE POLICY "select_file_as_member" ON file_assets FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = file_assets.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_file_as_member" ON file_assets;
CREATE POLICY "insert_file_as_member" ON file_assets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = file_assets.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_file_as_member" ON file_assets;
CREATE POLICY "update_file_as_member" ON file_assets FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = file_assets.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = file_assets.workspace_id AND user_id = auth.uid())
  );

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_external_thread_id ON conversations(external_thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id ON messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_conversation_id ON tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_idempotency_key ON tasks(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_task_transitions_task_id ON task_transitions(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_id ON audit_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_correlation_id ON audit_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event_id ON webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_file_assets_workspace_id ON file_assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_file_assets_task_id ON file_assets(task_id);
