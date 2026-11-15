import type { ConnectorAdapter, OAuthAuthorizeUrlInput, OAuthTokenExchangeInput, OAuthTokenResponse, DiscoveredAsset } from '../../domain/integrations/connector-base.js';
export declare class GoogleConnectorAdapter implements ConnectorAdapter {
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
export declare const googleAdapter: GoogleConnectorAdapter;
//# sourceMappingURL=google-adapter.d.ts.map