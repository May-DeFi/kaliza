import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { success, created } from '../middleware/response.js';
import { ValidationError } from '../middleware/errors.js';
import { getAuthorizeUrl, handleOAuthCallback, listConnections, getConnection, disconnectConnection, discoverAndStoreAssets, listAssets, selectAsset, } from '../../domain/integrations/integration-service.js';
import { env } from '../../config/env.js';
const router = Router();
router.get('/authorize/:provider', authenticate, async (req, res, next) => {
    try {
        const { workspace_id, scopes } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const scopeList = scopes ? scopes.split(',') : [];
        const redirectUri = `${env.server.nodeEnv === 'production' ? '' : 'http://localhost:3000'}${req.baseUrl}/${req.params.provider}/callback`;
        const url = getAuthorizeUrl(req.params.provider, workspace_id, redirectUri, scopeList);
        success(res, { authorize_url: url });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:provider/callback', async (req, res, next) => {
    try {
        const { code, state } = req.query;
        if (!code || !state)
            throw new ValidationError('Missing code or state parameter');
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        const redirectUri = `${env.server.nodeEnv === 'production' ? '' : 'http://localhost:3000'}${req.baseUrl}/${req.params.provider}/callback`;
        const connection = await handleOAuthCallback({
            provider: req.params.provider,
            code,
            redirect_uri: redirectUri,
            workspace_id: decoded.workspace_id,
        });
        res.redirect(302, `/integrations/success?connection_id=${connection.id}`);
    }
    catch (err) {
        next(err);
    }
});
router.get('/', authenticate, async (req, res, next) => {
    try {
        const { workspace_id } = req.query;
        if (!workspace_id)
            throw new ValidationError('workspace_id query parameter required');
        const connections = await listConnections(workspace_id);
        success(res, connections);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const connection = await getConnection(req.params.id);
        success(res, connection);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/disconnect', authenticate, async (req, res, next) => {
    try {
        await disconnectConnection(req.params.id);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/discover-assets', authenticate, async (req, res, next) => {
    try {
        const assets = await discoverAndStoreAssets(req.params.id);
        created(res, assets);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/assets', authenticate, async (req, res, next) => {
    try {
        const assets = await listAssets(req.params.id);
        success(res, assets);
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/assets/:assetId/select', authenticate, async (req, res, next) => {
    try {
        const selected = req.body.selected ?? true;
        const asset = await selectAsset(req.params.id, req.params.assetId, selected);
        success(res, asset);
    }
    catch (err) {
        next(err);
    }
});
export default router;
//# sourceMappingURL=integration-routes.js.map