/*
# Phase 3: Approvals, Tool Registry, Model Usage, Agent Runs

1. New Tables
- `agent_runs` — Agent orchestration runs. Links to task, orchestrator type, external run ID, status, trace metadata.
- `approvals` — Approval requests bound to tasks and exact action payloads. Tracks risk class, action hash+version, payload, decision status, approver, expiry.
- `tool_registry` — Catalog of available tools. Each has tool_id, version, input/output schemas, connector, required scopes/entitlements, risk classification, approval policy, timeout, retry, execution environment, usage category.
- `tool_invocations` — Record of every tool execution. Links to task/agent run, tool version, input hash, output reference, status, duration.
- `model_usage` — AI model usage tracking. Provider, model, token counts, latency, cost, task/agent run IDs, status.
- `workflow_runs` — Durable workflow executions. Links to task, definition, state, checkpoint, attempt count.

2. Relationships
- agent_runs.task_id -> tasks.id
- approvals.task_id -> tasks.id, approvals.workspace_id -> workspaces.id
- tool_invocations.task_id -> tasks.id, tool_invocations.agent_run_id -> agent_runs.id, tool_invocations.workspace_id -> workspaces.id
- model_usage.workspace_id -> workspaces.id, model_usage.task_id -> tasks.id, model_usage.agent_run_id -> agent_runs.id
- workflow_runs.task_id -> tasks.id

3. Security
- RLS on all tables. tool_registry readable by all authenticated (catalog).
- All tenant-owned tables scoped by workspace membership.
- service_role has full access to all tables.

4. Indexes on all frequently-queried columns.
*/

-- ============ TABLES (agent_runs first, referenced by others) ============

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  orchestrator text NOT NULL DEFAULT 'kaliza-default',
  external_run_id text,
  status text NOT NULL DEFAULT 'CREATED',
  trace_metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action_hash text NOT NULL,
  action_version int NOT NULL DEFAULT 1,
  risk text NOT NULL DEFAULT 'LOW',
  payload jsonb NOT NULL DEFAULT '{}',
  decision text NOT NULL DEFAULT 'PENDING',
  approver_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  expiry timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id text UNIQUE NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  description text,
  input_schema jsonb DEFAULT '{}',
  output_schema jsonb DEFAULT '{}',
  connector text,
  required_scopes text[] DEFAULT '{}',
  required_entitlements text[] DEFAULT '{}',
  risk text NOT NULL DEFAULT 'LOW',
  approval_policy jsonb DEFAULT '{}',
  timeout_ms int NOT NULL DEFAULT 30000,
  retry_policy jsonb DEFAULT '{}',
  execution_environment text NOT NULL DEFAULT 'CORE',
  usage_category text,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  agent_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tool_id text NOT NULL,
  tool_version text NOT NULL,
  input_hash text,
  output_ref text,
  status text NOT NULL DEFAULT 'PENDING',
  duration_ms int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  agent_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  latency_ms int,
  cost numeric(12,6) DEFAULT 0,
  status text NOT NULL DEFAULT 'SUCCESS',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  definition_id text NOT NULL,
  definition_version int NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'PENDING',
  checkpoint jsonb DEFAULT '{}',
  attempt int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS ============

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

-- ============ GRANTS ============

GRANT SELECT, INSERT, UPDATE ON agent_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_runs TO service_role;

GRANT SELECT, INSERT, UPDATE ON approvals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON approvals TO service_role;

GRANT SELECT ON tool_registry TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tool_registry TO service_role;

GRANT SELECT, INSERT, UPDATE ON tool_invocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tool_invocations TO service_role;

GRANT SELECT, INSERT ON model_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON model_usage TO service_role;

GRANT SELECT, INSERT, UPDATE ON workflow_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workflow_runs TO service_role;

-- ============ POLICIES: agent_runs ============

DROP POLICY IF EXISTS "select_agent_run_as_member" ON agent_runs;
CREATE POLICY "select_agent_run_as_member" ON agent_runs FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = agent_runs.task_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_agent_run_as_member" ON agent_runs;
CREATE POLICY "insert_agent_run_as_member" ON agent_runs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = agent_runs.task_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_agent_run_as_member" ON agent_runs;
CREATE POLICY "update_agent_run_as_member" ON agent_runs FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = agent_runs.task_id AND m.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = agent_runs.task_id AND m.user_id = auth.uid()
    )
  );

-- ============ POLICIES: approvals ============

DROP POLICY IF EXISTS "select_approval_as_member" ON approvals;
CREATE POLICY "select_approval_as_member" ON approvals FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = approvals.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_approval_as_member" ON approvals;
CREATE POLICY "insert_approval_as_member" ON approvals FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = approvals.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_approval_as_member" ON approvals;
CREATE POLICY "update_approval_as_member" ON approvals FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = approvals.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = approvals.workspace_id AND user_id = auth.uid())
  );

-- ============ POLICIES: tool_registry ============

DROP POLICY IF EXISTS "select_tool_registry" ON tool_registry;
CREATE POLICY "select_tool_registry" ON tool_registry FOR SELECT
  TO authenticated USING (true);

-- ============ POLICIES: tool_invocations ============

DROP POLICY IF EXISTS "select_tool_invocation_as_member" ON tool_invocations;
CREATE POLICY "select_tool_invocation_as_member" ON tool_invocations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tool_invocations.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_tool_invocation_as_member" ON tool_invocations;
CREATE POLICY "insert_tool_invocation_as_member" ON tool_invocations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tool_invocations.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_tool_invocation_as_member" ON tool_invocations;
CREATE POLICY "update_tool_invocation_as_member" ON tool_invocations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tool_invocations.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = tool_invocations.workspace_id AND user_id = auth.uid())
  );

-- ============ POLICIES: model_usage ============

DROP POLICY IF EXISTS "select_model_usage_as_member" ON model_usage;
CREATE POLICY "select_model_usage_as_member" ON model_usage FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = model_usage.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_model_usage_as_member" ON model_usage;
CREATE POLICY "insert_model_usage_as_member" ON model_usage FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = model_usage.workspace_id AND user_id = auth.uid())
  );

-- ============ POLICIES: workflow_runs ============

DROP POLICY IF EXISTS "select_workflow_run_as_member" ON workflow_runs;
CREATE POLICY "select_workflow_run_as_member" ON workflow_runs FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = workflow_runs.task_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_workflow_run_as_member" ON workflow_runs;
CREATE POLICY "insert_workflow_run_as_member" ON workflow_runs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = workflow_runs.task_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_workflow_run_as_member" ON workflow_runs;
CREATE POLICY "update_workflow_run_as_member" ON workflow_runs FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = workflow_runs.task_id AND m.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      JOIN memberships m ON m.workspace_id = t.workspace_id
      WHERE t.id = workflow_runs.task_id AND m.user_id = auth.uid()
    )
  );

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_approvals_task_id ON approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_approvals_workspace_id ON approvals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_approvals_decision ON approvals(decision);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_task_id ON tool_invocations(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_workspace_id ON tool_invocations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_workspace_id ON model_usage(workspace_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_task_id ON model_usage(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_task_id ON workflow_runs(task_id);
