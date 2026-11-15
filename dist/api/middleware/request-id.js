import { generateCorrelationId } from '../../adapters/encryption/crypto.js';
export function requestId(req, res, next) {
    const id = req.headers['x-request-id'] ?? generateCorrelationId();
    res.locals.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
}
//# sourceMappingURL=request-id.js.map