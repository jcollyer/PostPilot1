import { Platform } from '@saas/db';

import { deriveCodeChallenge } from '../crypto';
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

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const USER_URL = 'https://open.tiktokapis.com/v2/user/info/';

const DEFAULT_SCOPES = ['user.info.basic', 'video.publish'];

/** Sandbox vs prod is selected by TIKTOK_ENV; clients have separate keys. */
function credentials(): { clientKey?: string; clientSecret?: string } {
  const prod = (process.env.TIKTOK_ENV ?? 'sandbox').toLowerCase() === 'prod';
  return prod
    ? {
        clientKey: process.env.TIKTOK_CLIENT_KEY_PROD,
        clientSecret: process.env.TIKTOK_CLIENT_SECRET_PROD,
      }
    : {
        clientKey: process.env.TIKTOK_CLIENT_KEY_SANDBOX,
        clientSecret: process.env.TIKTOK_CLIENT_SECRET_SANDBOX,
      };
}

interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
}

interface TikTokUserResponse {
  data?: { user?: { open_id?: string; union_id?: string; display_name?: string } };
  error?: { code?: string; message?: string };
}

async function postToken(params: Record<string, string | undefined>): Promise<TikTokTokenResponse> {
  return requestJson<TikTokTokenResponse>(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody(params),
    context: 'TikTok token',
    platform: Platform.TIKTOK,
  });
}

function toTokens(r: TikTokTokenResponse): OAuthTokens {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    tokenType: r.token_type,
    scope: r.scope,
    accessTokenExpiresAt: expiresAt(r.expires_in),
    refreshTokenExpiresAt: expiresAt(r.refresh_expires_in),
  };
}

export const tiktokAdapter: PlatformAdapter = {
  platform: Platform.TIKTOK,
  usesPkce: true,
  // Access token lives ~24h; refresh a couple hours ahead.
  refreshLeadMs: 2 * 60 * 60 * 1000,

  isConfigured() {
    const { clientKey, clientSecret } = credentials();
    return Boolean(clientKey && clientSecret);
  },

  getAuthorizationUrl({ redirectUri, state, codeVerifier, scopes }: AuthorizeOptions): AuthorizationRequest {
    const { clientKey } = credentials();
    if (!codeVerifier) {
      throw new OAuthError('TikTok requires PKCE (missing code verifier).', {
        recoverable: false,
        platform: Platform.TIKTOK,
      });
    }
    return {
      url: buildUrl(AUTHORIZE_URL, {
        client_key: clientKey,
        scope: (scopes ?? DEFAULT_SCOPES).join(','),
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
        code_challenge: deriveCodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
      }),
    };
  },

  async exchangeCode({ code, redirectUri, codeVerifier }: ExchangeParams) {
    const { clientKey, clientSecret } = credentials();
    const res = await postToken({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    const tokens = toTokens(res);
    const identity = await this.fetchIdentity(res.access_token).catch(() => ({
      externalAccountId: res.open_id,
    }));
    return {
      tokens,
      identity: { ...identity, externalAccountId: identity.externalAccountId ?? res.open_id },
    };
  },

  async refreshTokens({ refreshToken }: RefreshParams): Promise<OAuthTokens> {
    if (!refreshToken) {
      throw new OAuthError('TikTok refresh requires a refresh token.', {
        recoverable: false,
        platform: Platform.TIKTOK,
      });
    }
    const { clientKey, clientSecret } = credentials();
    // TikTok rotates the refresh token on every use — the returned value must
    // be persisted (handled by the refresh service).
    const res = await postToken({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return toTokens(res);
  },

  async fetchIdentity(accessToken: string): Promise<PlatformIdentity> {
    const res = await requestJson<TikTokUserResponse>(
      buildUrl(USER_URL, { fields: 'open_id,union_id,display_name' }),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        context: 'TikTok user.info',
        platform: Platform.TIKTOK,
      },
    );
    const user = res.data?.user;
    if (!user?.open_id) {
      throw new OAuthError('TikTok user.info returned no open_id.', {
        recoverable: false,
        platform: Platform.TIKTOK,
      });
    }
    return {
      externalAccountId: user.open_id,
      displayName: user.display_name ?? null,
    };
  },

  async revoke({ accessToken }: RefreshParams): Promise<void> {
    if (!accessToken) return;
    const { clientKey, clientSecret } = credentials();
    await requestJson<unknown>(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({
        client_key: clientKey,
        client_secret: clientSecret,
        token: accessToken,
      }),
      context: 'TikTok revoke',
      platform: Platform.TIKTOK,
    }).catch(() => undefined);
  },
};
