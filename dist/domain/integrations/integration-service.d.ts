import type { IntegrationConnection, ProviderAsset } from '../../contracts/types.js';
export declare function getAuthorizeUrl(provider: string, workspaceId: string, redirectUri: string, scopes: string[]): string;
export declare function handleOAuthCallback(input: {
    provider: string;
    code: string;
    redirect_uri: string;
    workspace_id: string;
    connection_type?: string;
}): Promise<IntegrationConnection>;
export declare function listConnections(workspaceId: string): Promise<IntegrationConnection[]>;
export declare function getConnection(id: string): Promise<IntegrationConnection>;
export declare function disconnectConnection(id: string): Promise<void>;
export declare function getDecryptedCredentials(connection: IntegrationConnection): {
    access_token: string;
    refresh_token?: string;
    expires_at?: string | null;
} | null;
export declare function refreshConnectionIfNeeded(connection: IntegrationConnection): Promise<IntegrationConnection>;
export declare function discoverAndStoreAssets(connectionId: string): Promise<ProviderAsset[]>;
export declare function listAssets(connectionId: string): Promise<ProviderAsset[]>;
export declare function selectAsset(connectionId: string, assetId: string, selected: boolean): Promise<ProviderAsset>;
//# sourceMappingURL=integration-service.d.ts.map