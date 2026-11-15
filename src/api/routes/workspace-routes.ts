import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authenticate, requireWorkspaceAccess, requireRole } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError, NotFoundError } from '../middleware/errors.js';
import {
  createIndividualWorkspace,
  createBusinessWorkspace,
  getWorkspace,
  listUserWorkspaces,
  getWorkspaceMemberships,
  addMember,
  updateMemberRole,
  removeMember,
  grantServiceEntitlement,
  getWorkspaceEntitlements,
} from '../../domain/tenancy/workspace-service.js';
import { MembershipRole, ServiceId, WorkspaceType } from '../../config/constants.js';

const router = Router();

const createIndividualSchema = z.object({
  name: z.string().min(1).max(200),
});

const createBusinessSchema = z.object({
  org_name: z.string().min(1).max(200),
  workspace_name: z.string().min(1).max(200).optional(),
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.userId) throw new ValidationError('No user ID');
    const workspaces = await listUserWorkspaces(req.userId);
    success(res, workspaces);
  } catch (err) {
    next(err);
  }
});

router.post('/individual', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = createIndividualSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    if (!req.userId) throw new ValidationError('No user ID');
    const { workspace, membership } = await createIndividualWorkspace(req.userId, parsed.data.name);
    await grantServiceEntitlement({
      workspace_id: workspace.id,
      service_id: ServiceId.BUSINESS_GROWTH,
      plan: 'FREE',
    });
    created(res, { workspace, membership });
  } catch (err) {
    next(err);
  }
});

router.post('/business', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = createBusinessSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    if (!req.userId) throw new ValidationError('No user ID');
    const { organization, workspace, membership } = await createBusinessWorkspace({
      orgName: parsed.data.org_name,
      ownerId: req.userId,
      workspaceName: parsed.data.workspace_name,
    });
    await grantServiceEntitlement({
      workspace_id: workspace.id,
      service_id: ServiceId.BUSINESS_GROWTH,
      plan: 'FREE',
    });
    created(res, { organization, workspace, membership });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, requireWorkspaceAccess, async (req: AuthenticatedRequest, res, next) => {
  try {
    const workspace = await getWorkspace(req.params.id);
    success(res, workspace);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/memberships', authenticate, requireWorkspaceAccess, async (req: AuthenticatedRequest, res, next) => {
  try {
    const memberships = await getWorkspaceMemberships(req.params.id);
    success(res, memberships);
  } catch (err) {
    next(err);
  }
});

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
  permissions: z.array(z.string()).optional(),
});

router.post('/:id/memberships', authenticate, requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    const membership = await addMember({
      workspace_id: req.params.id,
      user_id: parsed.data.user_id,
      role: parsed.data.role,
      permissions: parsed.data.permissions,
    });
    created(res, membership);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/memberships/:userId', authenticate, requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const role = (req.body as { role?: string }).role;
    if (!role || !['ADMIN', 'MEMBER'].includes(role)) {
      throw new ValidationError('Invalid role — must be ADMIN or MEMBER');
    }
    const membership = await updateMemberRole(req.params.id, req.params.userId, role);
    success(res, membership);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/memberships/:userId', authenticate, requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    await removeMember(req.params.id, req.params.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/entitlements', authenticate, requireWorkspaceAccess, async (req: AuthenticatedRequest, res, next) => {
  try {
    const entitlements = await getWorkspaceEntitlements(req.params.id);
    success(res, entitlements);
  } catch (err) {
    next(err);
  }
});

const grantEntitlementSchema = z.object({
  service_id: z.string(),
  plan: z.string().default('FREE'),
  limits: z.record(z.unknown()).optional(),
});

router.post('/:id/entitlements', authenticate, requireWorkspaceAccess, requireRole('OWNER', 'ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = grantEntitlementSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid input', parsed.error.issues);
    const entitlement = await grantServiceEntitlement({
      workspace_id: req.params.id,
      service_id: parsed.data.service_id,
      plan: parsed.data.plan,
      limits: parsed.data.limits,
    });
    created(res, entitlement);
  } catch (err) {
    next(err);
  }
});

export default router;
