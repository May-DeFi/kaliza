/*
# Phase 5: Integration Connections and Provider Assets

1. New Tables
- `integration_connections` — OAuth connections to external providers (Google, Meta, etc.). Stores workspace ownership, provider, account identifier/name, encrypted credentials, scopes, status, connection type (control vs business).
- `provider_assets` — Assets discovered through a connection (Facebook pages, Instagram accounts, ad accounts, Google calendars, drives, etc.). Tracks asset type, provider asset ID, display name, metadata, selected status.

2. Relationships
- integration_connections.workspace_id -> workspaces.id
- provider_assets.connection_id -> integration_connections.id

3. Security
- RLS on both tables, scoped by workspace membership.
- integration_connections: authenticated can SELECT/INSERT/UPDATE (not DELETE — connections should be disconnected, not hard-deleted).
- provider_assets: full CRUD for authenticated.
- service_role has full access.

4. Indexes
- integration_connections.workspace_id, integration_connections.provider
- provider_assets.connection_id
*/

CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  account_identifier text,
  account_name text,
  encrypted_credentials text,
  scopes text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'ACTIVE',
  connection_type text NOT NULL DEFAULT 'BUSINESS',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  provider_asset_id text NOT NULL,
  display_name text,
  metadata jsonb DEFAULT '{}',
  selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, asset_type, provider_asset_id)
);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_assets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON integration_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON integration_connections TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON provider_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_assets TO service_role;

DROP POLICY IF EXISTS "select_connection_as_member" ON integration_connections;
CREATE POLICY "select_connection_as_member" ON integration_connections FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = integration_connections.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_connection_as_member" ON integration_connections;
CREATE POLICY "insert_connection_as_member" ON integration_connections FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = integration_connections.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_connection_as_member" ON integration_connections;
CREATE POLICY "update_connection_as_member" ON integration_connections FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = integration_connections.workspace_id AND user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = integration_connections.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "select_asset_as_member" ON provider_assets;
CREATE POLICY "select_asset_as_member" ON provider_assets FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM integration_connections ic
      JOIN memberships m ON m.workspace_id = ic.workspace_id
      WHERE ic.id = provider_assets.connection_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_asset_as_member" ON provider_assets;
CREATE POLICY "insert_asset_as_member" ON provider_assets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM integration_connections ic
      JOIN memberships m ON m.workspace_id = ic.workspace_id
      WHERE ic.id = provider_assets.connection_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_asset_as_member" ON provider_assets;
CREATE POLICY "update_asset_as_member" ON provider_assets FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM integration_connections ic
      JOIN memberships m ON m.workspace_id = ic.workspace_id
      WHERE ic.id = provider_assets.connection_id AND m.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM integration_connections ic
      JOIN memberships m ON m.workspace_id = ic.workspace_id
      WHERE ic.id = provider_assets.connection_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_asset_as_member" ON provider_assets;
CREATE POLICY "delete_asset_as_member" ON provider_assets FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM integration_connections ic
      JOIN memberships m ON m.workspace_id = ic.workspace_id
      WHERE ic.id = provider_assets.connection_id AND m.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_connections_workspace_id ON integration_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connections_provider ON integration_connections(provider);
CREATE INDEX IF NOT EXISTS idx_provider_assets_connection_id ON provider_assets(connection_id);
