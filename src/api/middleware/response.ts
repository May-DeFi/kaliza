import type { Response } from 'express';
import { generateCorrelationId } from '../../adapters/encryption/crypto.js';

export function success<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({
    data,
    request_id: res.locals.requestId ?? generateCorrelationId(),
  });
}

export function successPaginated<T>(
  res: Response,
  data: T[],
  page: number,
  perPage: number,
  total: number,
): Response {
  const hasMore = page * perPage < total;
  return res.status(200).json({
    data,
    pagination: { page, per_page: perPage, total, has_more: hasMore },
    request_id: res.locals.requestId ?? generateCorrelationId(),
  });
}

export function created<T>(res: Response, data: T): Response {
  return success(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function error(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return res.status(statusCode).json({
    error: { code, message, ...(details ? { details } : {}) },
    request_id: res.locals.requestId ?? generateCorrelationId(),
  });
}
