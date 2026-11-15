import { getSupabaseAdminClient } from '../../adapters/database/supabase.js';
import { encrypt, decrypt } from '../../adapters/encryption/crypto.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, ConflictError } from '../../api/middleware/errors.js';
import { googleAdapter } from '../../adapters/google/google-adapter.js';
import { metaAdapter } from '../../adapters/meta/meta-adapter.js';
import { generateCorrelationId } from '../../adapters/encryption/crypto.js';
const ADAPTERS = {
    google: googleAdapter,
    meta: metaAdapter,
};
function getAdapter(provider) {
    const adapter = ADAPTERS[provider];
    if (!adapter)
        throw new NotFoundError('Connector adapter', provider);
    return adapter;
}
export function getAuthorizeUrl(provider, workspaceId, redirectUri, scopes) {
    const adapter = getAdapter(provider);
    const state = Buffer.from(JSON.stringify({ workspace_id: workspaceId, provider, nonce: generateCorrelationId() })).toString('base64url');
    return adapter.getAuthorizeUrl({ workspace_id: workspaceId, redirect_uri: redirectUri, state, scopes });
}
export async function handleOAuthCallback(input) {
    const adapter = getAdapter(input.provider);
    const tokenResponse = await adapter.exchangeCode({ code: input.code, redirect_uri: input.redirect_uri });
    const accountInfo = await adapter.getAccountInfo(tokenResponse.access_token);
    const encryptedCreds = encrypt(JSON.stringify({
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString() : null,
    }));
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('integration_connections')
        .insert({
        workspace_id: input.workspace_id,
        provider: input.provider,
        account_identifier: accountInfo.identifier,
        account_name: accountInfo.name,
        encrypted_credentials: encryptedCreds,
        scopes: tokenResponse.scope ? tokenResponse.scope.split(' ') : [],
        status: 'ACTIVE',
        connection_type: input.connection_type ?? 'BUSINESS',
    })
        .select('*')
        .single();
    if (error)
        throw error;
    logger.info('Integration connection created', { provider: input.provider, account: accountInfo.identifier });
    return data;
}
export async function listConnections(workspaceId) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('integration_connections')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return (data ?? []);
}
export async function getConnection(id) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('integration_connections')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new NotFoundError('IntegrationConnection', id);
    return data;
}
export async function disconnectConnection(id) {
    const connection = await getConnection(id);
    const adapter = getAdapter(connection.provider);
    const creds = getDecryptedCredentials(connection);
    if (creds?.access_token) {
        try {
            await adapter.revokeToken(creds.access_token);
        }
        catch (err) {
            logger.warn('Token revocation failed during disconnect', { connectionId: id, error: err instanceof Error ? err.message : String(err) });
        }
    }
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
        .from('integration_connections')
        .update({ status: 'DISCONNECTED', updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error)
        throw error;
}
export function getDecryptedCredentials(connection) {
    if (!connection.encrypted_credentials)
        return null;
    try {
        return JSON.parse(decrypt(connection.encrypted_credentials));
    }
    catch {
        logger.error('Failed to decrypt credentials', { connectionId: connection.id });
        return null;
    }
}
export async function refreshConnectionIfNeeded(connection) {
    const creds = getDecryptedCredentials(connection);
    if (!creds?.expires_at)
        return connection;
    const expiresAt = new Date(creds.expires_at);
    const buffer = 5 * 60 * 1000;
    if (expiresAt.getTime() - Date.now() > buffer)
        return connection;
    if (!creds.refresh_token)
        return connection;
    const adapter = getAdapter(connection.provider);
    const newToken = await adapter.refreshToken(creds.refresh_token);
    const newCreds = encrypt(JSON.stringify({
        access_token: newToken.access_token,
        refresh_token: newToken.refresh_token ?? creds.refresh_token,
        expires_at: newToken.expires_in ? new Date(Date.now() + newToken.expires_in * 1000).toISOString() : creds.expires_at,
    }));
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('integration_connections')
        .update({ encrypted_credentials: newCreds, updated_at: new Date().toISOString() })
        .eq('id', connection.id)
        .select('*')
        .single();
    if (error)
        throw error;
    logger.info('Connection token refreshed', { connectionId: connection.id, provider: connection.provider });
    return data;
}
export async function discoverAndStoreAssets(connectionId) {
    const connection = await getConnection(connectionId);
    const refreshed = await refreshConnectionIfNeeded(connection);
    const creds = getDecryptedCredentials(refreshed);
    if (!creds)
        throw new ConflictError('No valid credentials for connection');
    const adapter = getAdapter(connection.provider);
    const assets = await adapter.discoverAssets(creds.access_token);
    const supabase = getSupabaseAdminClient();
    const rows = assets.map((a) => ({
        connection_id: connectionId,
        asset_type: a.asset_type,
        provider_asset_id: a.provider_asset_id,
        display_name: a.display_name,
        metadata: a.metadata,
        selected: false,
    }));
    const { data, error } = await supabase
        .from('provider_assets')
        .upsert(rows, { onConflict: 'connection_id,asset_type,provider_asset_id' })
        .select('*');
    if (error)
        throw error;
    return (data ?? []);
}
export async function listAssets(connectionId) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('provider_assets')
        .select('*')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false });
    if (error)
        throw error;
    return (data ?? []);
}
export async function selectAsset(connectionId, assetId, selected) {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
        .from('provider_assets')
        .update({ selected, updated_at: new Date().toISOString() })
        .eq('id', assetId)
        .eq('connection_id', connectionId)
        .select('*')
        .maybeSingle();
    if (error)
        throw error;
    if (!data)
        throw new NotFoundError('ProviderAsset', assetId);
    return data;
}
//# sourceMappingURL=integration-service.js.map