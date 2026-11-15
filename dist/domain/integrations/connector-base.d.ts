import type { IntegrationConnection } from '../../contracts/types.js';
export interface OAuthAuthorizeUrlInput {
    workspace_id: string;
    redirect_uri: string;
    state: string;
    scopes: string[];
}
export interface OAuthTokenExchangeInput {
    code: string;
    redirect_uri: string;
    code_verifier?: string;
}
export interface OAuthTokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
}
export interface ConnectorAdapter {
    provider: string;
    getAuthorizeUrl(input: OAuthAuthorizeUrlInput): string;
    exchangeCode(input: OAuthTokenExchangeInput): Promise<OAuthTokenResponse>;
    refreshToken(refreshToken: string): Promise<OAuthTokenResponse>;
    revokeToken(accessToken: string): Promise<void>;
    discoverAssets(accessToken: string): Promise<DiscoveredAsset[]>;
    getAccountInfo(accessToken: string): Promise<{
        identifier: string;
        name: string;
    }>;
}
export interface DiscoveredAsset {
    asset_type: string;
    provider_asset_id: string;
    display_name: string;
    metadata: Record<string, unknown>;
}
export interface CreateConnectionInput {
    workspace_id: string;
    provider: string;
    account_identifier?: string;
    account_name?: string;
    encrypted_credentials: string;
    scopes: string[];
    connection_type?: string;
}
export interface StoreConnectionResult {
    connection: IntegrationConnection;
}
//# sourceMappingURL=connector-base.d.ts.map