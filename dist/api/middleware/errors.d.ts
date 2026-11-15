export declare class ApiError extends Error {
    statusCode: number;
    code: string;
    details?: unknown | undefined;
    constructor(statusCode: number, code: string, message: string, details?: unknown | undefined);
}
export declare class NotFoundError extends ApiError {
    constructor(resource: string, id?: string);
}
export declare class ValidationError extends ApiError {
    constructor(message: string, details?: unknown);
}
export declare class UnauthorizedError extends ApiError {
    constructor(message?: string);
}
export declare class ForbiddenError extends ApiError {
    constructor(message?: string);
}
export declare class ConflictError extends ApiError {
    constructor(message: string);
}
export declare class RateLimitError extends ApiError {
    constructor(message?: string);
}
export declare class InternalError extends ApiError {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map