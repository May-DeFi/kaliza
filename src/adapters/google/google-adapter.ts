import { env, isPlaceholder } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { ConnectorAdapter, OAuthAuthorizeUrlInput, OAuthTokenExchangeInput, OAuthTokenResponse, DiscoveredAsset } from '../../domain/integrations/connector-base.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/business.manage',
];

export class GoogleConnectorAdapter implements ConnectorAdapter {
  provider = 'google';

  getAuthorizeUrl(input: OAuthAuthorizeUrlInput): string {
    const params = new URLSearchParams({
      client_id: env.google.clientId,
      redirect_uri: input.redirect_uri,
      response_type: 'code',
      scope: (input.scopes.length > 0 ? input.scopes : DEFAULT_SCOPES).join(' '),
      state: input.state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(input: OAuthTokenExchangeInput): Promise<OAuthTokenResponse> {
    if (isPlaceholder(env.google.clientId)) {
      logger.warn('Google client ID is placeholder — returning stub token');
      return {
        access_token: 'stub_google_access_token',
        refresh_token: 'stub_google_refresh_token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: DEFAULT_SCOPES.join(' '),
      };
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        code: input.code,
        redirect_uri: input.redirect_uri,
        grant_type: 'authorization_code',
        ...(input.code_verifier ? { code_verifier: input.code_verifier } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
    }

    return await response.json() as OAuthTokenResponse;
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    if (isPlaceholder(env.google.clientId) || refreshToken.startsWith('stub_')) {
      return {
        access_token: 'stub_google_access_token_refreshed',
        refresh_token: refreshToken,
        expires_in: 3600,
        token_type: 'Bearer',
      };
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
    }

    return await response.json() as OAuthTokenResponse;
  }

  async revokeToken(accessToken: string): Promise<void> {
    if (accessToken.startsWith('stub_')) {
      logger.info('Google stub — simulated revoke');
      return;
    }

    const response = await fetch(`${GOOGLE_REVOKE_URL}?token=${accessToken}`, { method: 'POST' });
    if (!response.ok) {
      logger.warn('Google revoke failed', { status: response.status });
    }
  }

  async discoverAssets(accessToken: string): Promise<DiscoveredAsset[]> {
    if (accessToken.startsWith('stub_')) {
      return [
        { asset_type: 'drive', provider_asset_id: 'stub-drive-1', display_name: 'My Drive', metadata: {} },
        { asset_type: 'calendar', provider_asset_id: 'stub-calendar-1', display_name: 'Primary Calendar', metadata: {} },
      ];
    }

    // In production, call Google APIs to list drives, calendars, etc.
    return [];
  }

  async getAccountInfo(accessToken: string): Promise<{ identifier: string; name: string }> {
    if (accessToken.startsWith('stub_')) {
      return { identifier: 'stub-google-user@gmail.com', name: 'Stub Google User' };
    }

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Google userinfo failed: ${response.status}`);
    }

    const data = await response.json() as { id?: string; email?: string; name?: string };
    return { identifier: data.email ?? data.id ?? 'unknown', name: data.name ?? data.email ?? 'Unknown' };
  }
}

export const googleAdapter = new GoogleConnectorAdapter();
