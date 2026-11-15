import type { Response } from 'express';
export declare function success<T>(res: Response, data: T, statusCode?: number): Response;
export declare function successPaginated<T>(res: Response, data: T[], page: number, perPage: number, total: number): Response;
export declare function created<T>(res: Response, data: T): Response;
export declare function noContent(res: Response): Response;
export declare function error(res: Response, statusCode: number, code: string, message: string, details?: unknown): Response;
//# sourceMappingURL=response.d.ts.map