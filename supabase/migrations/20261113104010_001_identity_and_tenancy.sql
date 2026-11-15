/*
# Phase 1: Identity and Tenancy Foundation

1. New Tables
- `users` — Platform users. Links to Supabase auth.users via auth_subject. Stores profile, email, phone, status.
- `organizations` — Business organizations. Owned by a user.
- `workspaces` — Tenant workspaces. Type is INDIVIDUAL or BUSINESS. Isolation boundary.
- `memberships` — User-to-workspace membership with role (OWNER, ADMIN, MEMBER) and permissions array.
- `service_entitlements` — Per-workspace service entitlements with plan, status, and limits JSON.
- `service_registry` — Available service definitions with capabilities, versions, and availability.

2. Relationships
- workspaces.tenant_id -> organizations.id (nullable for individual workspaces)
- memberships.user_id -> users.id, memberships.workspace_id -> workspaces.id
- service_entitlements.workspace_id -> workspaces.id
- organizations.owner_id -> users.id

3. Security
- RLS enabled on all tables.
- Grants to authenticated role (multi-user platform requiring sign-in).
- service_registry readable by all authenticated users (catalog).
- Users can read/update their own user record.
- Users can read workspaces where they are a member.
- Users can manage memberships in workspaces where they are OWNER or ADMIN.
- service_role granted for edge function/server-side access.

4. Indexes on all frequently-queried columns.
*/

-- ============ TABLES (created first so cross-table policies resolve) ============

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject uuid UNIQUE,
  email text UNIQUE,
  phone text,
  full_name text,
  status text NOT NULL DEFAULT 'ACTIVE',
  profile jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'INDIVIDUAL',
  status text NOT NULL DEFAULT 'ACTIVE',
  settings jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'MEMBER',
  permissions text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS service_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  service_id text NOT NULL,
  plan text NOT NULL DEFAULT 'FREE',
  status text NOT NULL DEFAULT 'ACTIVE',
  limits jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, service_id)
);

CREATE TABLE IF NOT EXISTS service_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0.0',
  capabilities jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'ACTIVE',
  available boolean NOT NULL DEFAULT true,
  supported_channels text[] DEFAULT ARRAY['WHATSAPP'],
  task_intent_schemas jsonb DEFAULT '{}',
  required_context jsonb DEFAULT '{}',
  permitted_tools text[] DEFAULT '{}',
  risk_policy jsonb DEFAULT '{}',
  workflow_definitions jsonb DEFAULT '{}',
  output_types jsonb DEFAULT '[]',
  usage_categories jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS ENABLE ============

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_registry ENABLE ROW LEVEL SECURITY;

-- ============ GRANTS ============

GRANT SELECT, INSERT, UPDATE ON users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO service_role;

GRANT SELECT, INSERT, UPDATE ON service_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_entitlements TO service_role;

GRANT SELECT ON service_registry TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_registry TO service_role;

-- ============ POLICIES ============

-- users
DROP POLICY IF EXISTS "select_own_user" ON users;
CREATE POLICY "select_own_user" ON users FOR SELECT
  TO authenticated USING (auth.uid() = auth_subject);

DROP POLICY IF EXISTS "update_own_user" ON users;
CREATE POLICY "update_own_user" ON users FOR UPDATE
  TO authenticated USING (auth.uid() = auth_subject) WITH CHECK (auth.uid() = auth_subject);

-- organizations
DROP POLICY IF EXISTS "select_org_as_owner" ON organizations;
CREATE POLICY "select_org_as_owner" ON organizations FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM memberships m
      JOIN workspaces w ON w.id = m.workspace_id
      WHERE w.tenant_id = organizations.id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_org_as_owner" ON organizations;
CREATE POLICY "insert_org_as_owner" ON organizations FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "update_org_as_owner" ON organizations;
CREATE POLICY "update_org_as_owner" ON organizations FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "delete_org_as_owner" ON organizations;
CREATE POLICY "delete_org_as_owner" ON organizations FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- workspaces
DROP POLICY IF EXISTS "select_workspace_as_member" ON workspaces;
CREATE POLICY "select_workspace_as_member" ON workspaces FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = workspaces.id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_workspace" ON workspaces;
CREATE POLICY "insert_workspace" ON workspaces FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_workspace_as_member" ON workspaces;
CREATE POLICY "update_workspace_as_member" ON workspaces FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = workspaces.id AND user_id = auth.uid() AND role IN ('OWNER','ADMIN'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = workspaces.id AND user_id = auth.uid() AND role IN ('OWNER','ADMIN'))
  );

DROP POLICY IF EXISTS "delete_workspace_as_owner" ON workspaces;
CREATE POLICY "delete_workspace_as_owner" ON workspaces FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = workspaces.id AND user_id = auth.uid() AND role = 'OWNER')
  );

-- memberships
DROP POLICY IF EXISTS "select_membership_as_member" ON memberships;
CREATE POLICY "select_membership_as_member" ON memberships FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM memberships m2 WHERE m2.workspace_id = memberships.workspace_id AND m2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_membership_as_admin" ON memberships;
CREATE POLICY "insert_membership_as_admin" ON memberships FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM memberships m2
      WHERE m2.workspace_id = memberships.workspace_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('OWNER','ADMIN')
    )
  );

DROP POLICY IF EXISTS "update_membership_as_admin" ON memberships;
CREATE POLICY "update_membership_as_admin" ON memberships FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM memberships m2
      WHERE m2.workspace_id = memberships.workspace_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('OWNER','ADMIN')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m2
      WHERE m2.workspace_id = memberships.workspace_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('OWNER','ADMIN')
    )
  );

DROP POLICY IF EXISTS "delete_membership_as_admin" ON memberships;
CREATE POLICY "delete_membership_as_admin" ON memberships FOR DELETE
  TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM memberships m2
      WHERE m2.workspace_id = memberships.workspace_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('OWNER','ADMIN')
    )
  );

-- service_entitlements
DROP POLICY IF EXISTS "select_entitlement_as_member" ON service_entitlements;
CREATE POLICY "select_entitlement_as_member" ON service_entitlements FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM memberships WHERE workspace_id = service_entitlements.workspace_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_entitlement_as_admin" ON service_entitlements;
CREATE POLICY "insert_entitlement_as_admin" ON service_entitlements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships WHERE workspace_id = service_entitlements.workspace_id
      AND user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  );

DROP POLICY IF EXISTS "update_entitlement_as_admin" ON service_entitlements;
CREATE POLICY "update_entitlement_as_admin" ON service_entitlements FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM memberships WHERE workspace_id = service_entitlements.workspace_id
      AND user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships WHERE workspace_id = service_entitlements.workspace_id
      AND user_id = auth.uid() AND role IN ('OWNER','ADMIN')
    )
  );

-- service_registry
DROP POLICY IF EXISTS "select_service_registry" ON service_registry;
CREATE POLICY "select_service_registry" ON service_registry FOR SELECT
  TO authenticated USING (true);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_auth_subject ON users(auth_subject);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON workspaces(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace_id ON memberships(workspace_id);
CREATE INDEX IF NOT EXISTS idx_service_entitlements_workspace_id ON service_entitlements(workspace_id);
