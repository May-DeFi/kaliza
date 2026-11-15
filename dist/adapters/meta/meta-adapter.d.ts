import type { ConnectorAdapter, OAuthAuthorizeUrlInput, OAuthTokenExchangeInput, OAuthTokenResponse, DiscoveredAsset } from '../../domain/integrations/connector-base.js';
export declare class MetaConnectorAdapter implements ConnectorAdapter {
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
    sendWhatsAppMessage(input: {
        to: string;
        type?: string;
        text?: string;
        template_name?: string;
        template_language?: string;
    }): Promise<{
        message_id: string;
    }>;
}
export declare const metaAdapter: MetaConnectorAdapter;
//# sourceMappingURL=meta-adapter.d.ts.map