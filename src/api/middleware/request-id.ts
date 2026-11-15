import type { Request, Response, NextFunction } from 'express';
import { generateCorrelationId } from '../../adapters/encryption/crypto.js';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) ?? generateCorrelationId();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
