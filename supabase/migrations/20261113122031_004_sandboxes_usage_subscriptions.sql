/*
# Phase 4: Sandbox Instances, Usage Events, Subscriptions

1. New Tables
- `sandbox_instances` — Daytona sandbox lifecycle records. Tracks workspace/task ownership, Daytona ID, image, lifecycle state, lease expiry, resource limits, last activity.
- `usage_events` — Append-only usage ledger for metering. Records workspace, category, quantity, unit, cost, task/agent run association.
- `subscriptions` — Workspace subscription/entitlement state. Plan, billing state, limits JSON.

2. Relationships
- sandbox_instances.workspace_id -> workspaces.id
- sandbox_instances.task_id -> tasks.id
- usage_events.workspace_id -> workspaces.id
- usage_events.task_id -> tasks.id, usage_events.agent_run_id -> agent_runs.id
- subscriptions.workspace_id -> workspaces.id

3. Security
- RLS on all tables.
- sandbox_instances scoped by workspace membership.
- usage_events scoped by workspace membership (SELECT/INSERT only — append-only ledger).
- subscriptions scoped by workspace membership.
- service_role has full access.

4. Indexes
- sandbox_instances.workspace_id, sandbox_instances.task_id, sandbox_instances.status
- usage_events.workspace_id, usage_events.task_id
- subscriptions.workspace_id (unique)
*/

-- ============ TABLES ============

CREATE TABLE IF NOT EXISTS sandbox_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  daytona_id text,
  image text NOT NULL DEFAULT 'ubuntu:22.04',
  status text NOT NULL DEFAULT 'REQUESTED',
  lease_expiry timestamptz,
  resource_limits jsonb DEFAULT '{}',
  last_activity timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category text NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 0,
  unit text NOT NULL,
  cost numeric(12,6) DEFAULT 0,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  agent_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'FREE',
  status text NOT NULL DEFAULT 'ACTIVE',
  billing_state text NOT NULL DEFAULT 'CURRENT',
  limits jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS ============

ALTER TABLE sandbox_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ============ GRANTS ============

GRANT SELECT, INSERT, UPDATE ON sandbox_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sandbox_instances TO service_role;

GRANT SELECT, INSERT ON usage_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON usage_events TO service_role;

GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO service_role;

-- ============ POLICIES: sandbox_instances ============

DROP POLICY IF EXISTS "select_sandbox_as_member" ON sandbox_instances;
CREATE POLICY "select_sandbox_as_member" ON sandbox_instances FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = sandbox_instances.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_sandbox_as_member" ON sandbox_instances;
CREATE POLICY "insert_sandbox_as_member" ON sandbox_instances FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = sandbox_instances.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_sandbox_as_member" ON sandbox_instances;
CREATE POLICY "update_sandbox_as_member" ON sandbox_instances FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = sandbox_instances.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = sandbox_instances.workspace_id AND user_id = auth.uid())
  );

-- ============ POLICIES: usage_events ============

DROP POLICY IF EXISTS "select_usage_as_member" ON usage_events;
CREATE POLICY "select_usage_as_member" ON usage_events FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = usage_events.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_usage_as_member" ON usage_events;
CREATE POLICY "insert_usage_as_member" ON usage_events FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = usage_events.workspace_id AND user_id = auth.uid())
  );

-- ============ POLICIES: subscriptions ============

DROP POLICY IF EXISTS "select_subscription_as_member" ON subscriptions;
CREATE POLICY "select_subscription_as_member" ON subscriptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = subscriptions.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_subscription_as_admin" ON subscriptions;
CREATE POLICY "insert_subscription_as_admin" ON subscriptions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = subscriptions.workspace_id AND user_id = auth.uid() AND role IN ('OWNER','ADMIN'))
  );

DROP POLICY IF EXISTS "update_subscription_as_admin" ON subscriptions;
CREATE POLICY "update_subscription_as_admin" ON subscriptions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = subscriptions.workspace_id AND user_id = auth.uid() AND role IN ('OWNER','ADMIN'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = subscriptions.workspace_id AND user_id = auth.uid() AND role IN ('OWNER','ADMIN'))
  );

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_sandbox_workspace_id ON sandbox_instances(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_task_id ON sandbox_instances(task_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_status ON sandbox_instances(status);
CREATE INDEX IF NOT EXISTS idx_usage_workspace_id ON usage_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_usage_task_id ON usage_events(task_id);
