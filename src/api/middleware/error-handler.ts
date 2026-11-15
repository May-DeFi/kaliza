import type { Request, Response, NextFunction } from 'express';
import { ApiError } from './errors.js';
import { logger } from '../../config/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      request_id: res.locals.requestId ?? undefined,
    });
    return;
  }

  logger.error('Unhandled error', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    request_id: res.locals.requestId ?? undefined,
  });
}
