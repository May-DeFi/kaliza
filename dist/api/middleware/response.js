import { generateCorrelationId } from '../../adapters/encryption/crypto.js';
export function success(res, data, statusCode = 200) {
    return res.status(statusCode).json({
        data,
        request_id: res.locals.requestId ?? generateCorrelationId(),
    });
}
export function successPaginated(res, data, page, perPage, total) {
    const hasMore = page * perPage < total;
    return res.status(200).json({
        data,
        pagination: { page, per_page: perPage, total, has_more: hasMore },
        request_id: res.locals.requestId ?? generateCorrelationId(),
    });
}
export function created(res, data) {
    return success(res, data, 201);
}
export function noContent(res) {
    return res.status(204).send();
}
export function error(res, statusCode, code, message, details) {
    return res.status(statusCode).json({
        error: { code, message, ...(details ? { details } : {}) },
        request_id: res.locals.requestId ?? generateCorrelationId(),
    });
}
//# sourceMappingURL=response.js.map