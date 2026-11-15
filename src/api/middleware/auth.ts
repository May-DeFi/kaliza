import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { UnauthorizedError, ForbiddenError } from './errors.js';
import { findUserByAuthSubject } from '../../domain/identity/user-service.js';
import { getMembership } from '../../domain/tenancy/workspace-service.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  authSubject?: string;
  workspaceId?: string;
  membershipRole?: string;
}

export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid authorization header'));
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, env.auth.jwtSecret) as { sub: string; email?: string };
    req.authSubject = payload.sub;

    const user = await findUserByAuthSubject(payload.sub);
    if (!user) {
      return next(new UnauthorizedError('User not found'));
    }
    if (user.status !== 'ACTIVE') {
      return next(new ForbiddenError('User account is not active'));
    }
    req.userId = user.id;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export async function requireWorkspaceAccess(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const workspaceId = req.params.workspaceId ?? req.params.id ?? req.body.workspace_id;
  if (!workspaceId) {
    return next(new UnauthorizedError('Workspace ID required'));
  }
  if (!req.userId) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const membership = await getMembership(workspaceId, req.userId);
  if (!membership) {
    return next(new ForbiddenError('No access to this workspace'));
  }
  req.workspaceId = workspaceId;
  req.membershipRole = membership.role;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.membershipRole || !roles.includes(req.membershipRole)) {
      return next(new ForbiddenError(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}
