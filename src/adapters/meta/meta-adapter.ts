import { env, isPlaceholder } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { ConnectorAdapter, OAuthAuthorizeUrlInput, OAuthTokenExchangeInput, OAuthTokenResponse, DiscoveredAsset } from '../../domain/integrations/connector-base.js';

const META_AUTH_URL = 'https://www.facebook.com/v18.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v18.0/oauth/access_token';
const META_GRAPH_URL = 'https://graph.facebook.com/v18.0';

const DEFAULT_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_manage_insights',
  'ads_management',
  'ads_read',
  'whatsapp_business_messaging',
];

export class MetaConnectorAdapter implements ConnectorAdapter {
  provider = 'meta';

  getAuthorizeUrl(input: OAuthAuthorizeUrlInput): string {
    const params = new URLSearchParams({
      client_id: env.meta.appId,
      redirect_uri: input.redirect_uri,
      response_type: 'code',
      scope: (input.scopes.length > 0 ? input.scopes : DEFAULT_SCOPES).join(' '),
      state: input.state,
    });
    return `${META_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(input: OAuthTokenExchangeInput): Promise<OAuthTokenResponse> {
    if (isPlaceholder(env.meta.appId)) {
      logger.warn('Meta app ID is placeholder — returning stub token');
      return {
        access_token: 'stub_meta_access_token',
        refresh_token: 'stub_meta_refresh_token',
        expires_in: 5184000,
        token_type: 'Bearer',
        scope: DEFAULT_SCOPES.join(' '),
      };
    }

    const response = await fetch(META_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        code: input.code,
        redirect_uri: input.redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`Meta token exchange failed: ${response.status} ${await response.text()}`);
    }

    return await response.json() as OAuthTokenResponse;
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    if (refreshToken.startsWith('stub_')) {
      return {
        access_token: 'stub_meta_access_token_refreshed',
        refresh_token: refreshToken,
        expires_in: 5184000,
        token_type: 'Bearer',
      };
    }

    const response = await fetch(META_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.meta.appId,
        client_secret: env.meta.appSecret,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Meta token refresh failed: ${response.status} ${await response.text()}`);
    }

    return await response.json() as OAuthTokenResponse;
  }

  async revokeToken(accessToken: string): Promise<void> {
    if (accessToken.startsWith('stub_')) {
      logger.info('Meta stub — simulated revoke');
      return;
    }

    const response = await fetch(`${META_GRAPH_URL}/me/permissions`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      logger.warn('Meta revoke failed', { status: response.status });
    }
  }

  async discoverAssets(accessToken: string): Promise<DiscoveredAsset[]> {
    if (accessToken.startsWith('stub_')) {
      return [
        { asset_type: 'page', provider_asset_id: 'stub-page-1', display_name: 'My Business Page', metadata: { category: 'Business' } },
        { asset_type: 'instagram', provider_asset_id: 'stub-ig-1', display_name: 'My Instagram', metadata: {} },
        { asset_type: 'ad_account', provider_asset_id: 'stub-ad-1', display_name: 'Ad Account 1', metadata: { currency: 'USD' } },
      ];
    }

    const response = await fetch(`${META_GRAPH_URL}/me/accounts?access_token=${accessToken}`);
    if (!response.ok) {
      logger.warn('Meta discover assets failed', { status: response.status });
      return [];
    }

    const data = await response.json() as { data: { id: string; name: string; category?: string }[] };
    return data.data.map((page) => ({
      asset_type: 'page',
      provider_asset_id: page.id,
      display_name: page.name,
      metadata: { category: page.category },
    }));
  }

  async getAccountInfo(accessToken: string): Promise<{ identifier: string; name: string }> {
    if (accessToken.startsWith('stub_')) {
      return { identifier: 'stub-meta-user', name: 'Stub Meta User' };
    }

    const response = await fetch(`${META_GRAPH_URL}/me?access_token=${accessToken}`);
    if (!response.ok) {
      throw new Error(`Meta account info failed: ${response.status}`);
    }

    const data = await response.json() as { id?: string; name?: string };
    return { identifier: data.id ?? 'unknown', name: data.name ?? 'Unknown' };
  }

  async sendWhatsAppMessage(input: {
    to: string;
    type?: string;
    text?: string;
    template_name?: string;
    template_language?: string;
  }): Promise<{ message_id: string }> {
    if (isPlaceholder(env.meta.whatsappPhoneNumberId)) {
      logger.warn('Meta WhatsApp phone number ID is placeholder — returning stub send');
      return { message_id: `stub-wa-msg-${crypto.randomUUID()}` };
    }

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: input.type ?? 'text',
    };

    if (input.type === 'template' && input.template_name) {
      body.template = {
        name: input.template_name,
        language: { code: input.template_language ?? 'en_US' },
      };
    } else {
      body.text = { body: input.text ?? '' };
    }

    const response = await fetch(
      `${META_GRAPH_URL}/${env.meta.whatsappPhoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.meta.appSecret}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new Error(`WhatsApp send failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as { messages?: { id: string }[] };
    return { message_id: data.messages?.[0]?.id ?? crypto.randomUUID() };
  }
}

export const metaAdapter = new MetaConnectorAdapter();
