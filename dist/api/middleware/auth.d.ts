import type { Request, Response, NextFunction } from 'express';
export interface AuthenticatedRequest extends Request {
    userId?: string;
    authSubject?: string;
    workspaceId?: string;
    membershipRole?: string;
}
export declare function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void>;
export declare function requireWorkspaceAccess(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void>;
export declare function requireRole(...roles: string[]): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map