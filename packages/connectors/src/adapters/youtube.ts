import { Platform } from '@saas/db';

import { buildUrl, expiresAt, formBody, requestJson } from '../http';
import {
  OAuthError,
  type AuthorizationRequest,
  type AuthorizeOptions,
  type ExchangeParams,
  type OAuthTokens,
  type PlatformAdapter,
  type PlatformIdentity,
  type RefreshParams,
} from '../types';

// YouTube uses Google OAuth. Keep these creds separate from the Better Auth
// login Google client so the publishing consent screen/scopes are independent.
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

function credentials(): { clientId?: string; clientSecret?: string } {
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  };
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface ChannelsResponse {
  items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }>;
}

export const youtubeAdapter: PlatformAdapter = {
  platform: Platform.YOUTUBE,
  usesPkce: false,
  // Access token lives ~1h; refresh 10 minutes ahead.
  refreshLeadMs: 10 * 60 * 1000,

  isConfigured() {
    const { clientId, clientSecret } = credentials();
    return Boolean(clientId && clientSecret);
  },

  getAuthorizationUrl({ redirectUri, state, scopes }: AuthorizeOptions): AuthorizationRequest {
    const { clientId } = credentials();
    return {
      url: buildUrl(AUTHORIZE_URL, {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: (scopes ?? DEFAULT_SCOPES).join(' '),
        // offline + consent guarantees a refresh_token on first authorization.
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      }),
    };
  },

  async exchangeCode({ code, redirectUri }: ExchangeParams) {
    const { clientId, clientSecret } = credentials();
    const res = await requestJson<GoogleTokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      context: 'YouTube token',
      platform: Platform.YOUTUBE,
    });
    const identity = await this.fetchIdentity(res.access_token);
    const tokens: OAuthTokens = {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? null,
      tokenType: res.token_type,
      scope: res.scope,
      accessTokenExpiresAt: expiresAt(res.expires_in),
    };
    return { tokens, identity };
  },

  async refreshTokens({ refreshToken }: RefreshParams): Promise<OAuthTokens> {
    if (!refreshToken) {
      throw new OAuthError('YouTube refresh requires a refresh token.', {
        recoverable: false,
        platform: Platform.YOUTUBE,
      });
    }
    const { clientId, clientSecret } = credentials();
    const res = await requestJson<GoogleTokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
      context: 'YouTube refresh',
      platform: Platform.YOUTUBE,
    });
    // Google does not rotate the refresh token; preserve the existing one by
    // returning null here (the refresh service keeps the stored value).
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? null,
      tokenType: res.token_type,
      scope: res.scope,
      accessTokenExpiresAt: expiresAt(res.expires_in),
    };
  },

  async fetchIdentity(accessToken: string): Promise<PlatformIdentity> {
    const res = await requestJson<ChannelsResponse>(
      buildUrl(CHANNELS_URL, { part: 'snippet', mine: 'true' }),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        context: 'YouTube channels.list',
        platform: Platform.YOUTUBE,
      },
    );
    const channel = res.items?.[0];
    if (!channel?.id) {
      throw new OAuthError('YouTube channels.list returned no channel.', {
        recoverable: false,
        platform: Platform.YOUTUBE,
      });
    }
    return {
      externalAccountId: channel.id,
      username: channel.snippet?.customUrl ?? null,
      displayName: channel.snippet?.title ?? null,
    };
  },

  async revoke({ accessToken, refreshToken }: RefreshParams): Promise<void> {
    const token = refreshToken ?? accessToken;
    if (!token) return;
    await requestJson<unknown>(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ token }),
      context: 'YouTube revoke',
      platform: Platform.YOUTUBE,
    }).catch(() => undefined);
  },
};
