/*
# Phase 2: Job Queue Table

1. New Tables
- `job_queue` — Durable job queue for async work processing. Supports job types, payloads, priority, attempts with exponential backoff, max attempts with dead-letter, and available_at for delayed processing.

2. Security
- RLS enabled. Accessible only to service_role (internal infrastructure — workers process jobs server-side).
- No authenticated/anon grants — workers use service_role key.

3. Indexes
- job_queue(status, available_at) for dequeue performance
- job_queue(job_type, status) for typed dequeue
- job_queue(workspace_id) for per-tenant queries
*/

CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  workspace_id uuid,
  status text NOT NULL DEFAULT 'PENDING',
  priority int NOT NULL DEFAULT 5,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  available_at timestamptz NOT NULL DEFAULT now(),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON job_queue TO service_role;

CREATE INDEX IF NOT EXISTS idx_job_queue_status_available ON job_queue(status, available_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_type_status ON job_queue(job_type, status);
CREATE INDEX IF NOT EXISTS idx_job_queue_workspace_id ON job_queue(workspace_id);
