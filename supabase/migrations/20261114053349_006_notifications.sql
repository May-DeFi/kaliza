/*
# Phase 6: Notifications Table

1. New Tables
- `notifications` — User-facing notifications for WhatsApp and web delivery. Tracks workspace, user, type, channel, content, delivery state, retry count, task association.

2. Security
- RLS enabled, scoped by workspace membership.
- authenticated: SELECT/INSERT/UPDATE. service_role: full access.

3. Indexes
- notifications.workspace_id, notifications.user_id, notifications.delivery_state
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  channel text NOT NULL DEFAULT 'WHATSAPP',
  title text,
  content text NOT NULL,
  delivery_state text NOT NULL DEFAULT 'PENDING',
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 3,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO service_role;

DROP POLICY IF EXISTS "select_notification_as_member" ON notifications;
CREATE POLICY "select_notification_as_member" ON notifications FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM memberships WHERE workspace_id = notifications.workspace_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_notification_as_member" ON notifications;
CREATE POLICY "insert_notification_as_member" ON notifications FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = notifications.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_notification_as_member" ON notifications;
CREATE POLICY "update_notification_as_member" ON notifications FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = notifications.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = notifications.workspace_id AND user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_delivery_state ON notifications(delivery_state);
