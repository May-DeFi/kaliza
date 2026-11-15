export class ApiError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'ApiError';
    }
}
export class NotFoundError extends ApiError {
    constructor(resource, id) {
        super(404, 'NOT_FOUND', `${resource}${id ? ` with id ${id}` : ''} not found`);
        this.name = 'NotFoundError';
    }
}
export class ValidationError extends ApiError {
    constructor(message, details) {
        super(400, 'VALIDATION_ERROR', message, details);
        this.name = 'ValidationError';
    }
}
export class UnauthorizedError extends ApiError {
    constructor(message = 'Unauthorized') {
        super(401, 'UNAUTHORIZED', message);
        this.name = 'UnauthorizedError';
    }
}
export class ForbiddenError extends ApiError {
    constructor(message = 'Forbidden') {
        super(403, 'FORBIDDEN', message);
        this.name = 'ForbiddenError';
    }
}
export class ConflictError extends ApiError {
    constructor(message) {
        super(409, 'CONFLICT', message);
        this.name = 'ConflictError';
    }
}
export class RateLimitError extends ApiError {
    constructor(message = 'Rate limit exceeded') {
        super(429, 'RATE_LIMIT_EXCEEDED', message);
        this.name = 'RateLimitError';
    }
}
export class InternalError extends ApiError {
    constructor(message = 'Internal server error') {
        super(500, 'INTERNAL_ERROR', message);
        this.name = 'InternalError';
    }
}
//# sourceMappingURL=errors.js.map