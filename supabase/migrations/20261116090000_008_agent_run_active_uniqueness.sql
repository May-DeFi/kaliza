-- A task may have historical runs, but only one run may be active at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_one_active_per_task
  ON agent_runs (task_id)
  WHERE status IN ('CREATED', 'RUNNING', 'PAUSED', 'AWAITING_APPROVAL', 'AWAITING_INPUT');
