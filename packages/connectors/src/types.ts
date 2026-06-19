import type { Platform } from '@saas/db';

/** Tokens + expiries returned by a platform's OAuth endpoints. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
}

/** The connected account's identity on the platform. */
export interface PlatformIdentity {
  externalAccountId: string;
  username?: string | null;
  displayName?: string | null;
}

export interface AuthorizationRequest {
  url: string;
}

export interface AuthorizeOptions {
  redirectUri: string;
  state: string;
  /** Present only for PKCE platforms (see `usesPkce`). */
  codeVerifier?: string;
  /** Optional scope override; otherwise the adapter's defaults are used. */
  scopes?: string[];
}

export interface ExchangeParams {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface RefreshParams {
  accessToken: string | null;
  refreshToken: string | null;
}

/**
 * Common interface every platform implements for the connection lifecycle.
 * The publishing side (Publish(Video)) is layered on separately in a later
 * chunk; this interface is purely about OAuth + identity + token refresh.
 */
export interface PlatformAdapter {
  readonly platform: Platform;
  /** Whether this platform's OAuth client env vars are present. */
  isConfigured(): boolean;
  /** True if the authorization flow uses PKCE (TikTok). */
  readonly usesPkce: boolean;
  /** Lead time before access-token expiry at which we proactively refresh. */
  readonly refreshLeadMs: number;

  getAuthorizationUrl(opts: AuthorizeOptions): AuthorizationRequest;
  exchangeCode(
    params: ExchangeParams,
  ): Promise<{ tokens: OAuthTokens; identity: PlatformIdentity }>;
  refreshTokens(params: RefreshParams): Promise<OAuthTokens>;
  fetchIdentity(accessToken: string): Promise<PlatformIdentity>;
  /** Best-effort remote revoke on disconnect; optional per platform. */
  revoke?(params: RefreshParams): Promise<void>;
}

/**
 * Error raised by adapters during OAuth/token operations.
 *
 * `recoverable: false` means the connection cannot be auto-fixed (revoked
 * access, password change, app removed, invalid_grant) and must escalate to the
 * user as a "Reconnect [Platform]" action. `recoverable: true` is a transient
 * failure (network, 5xx, rate limit) that should be retried.
 */
export class OAuthError extends Error {
  readonly recoverable: boolean;
  readonly status?: number;
  readonly platform?: Platform;

  constructor(
    message: string,
    opts: { recoverable: boolean; status?: number; platform?: Platform } = {
      recoverable: true,
    },
  ) {
    super(message);
    this.name = 'OAuthError';
    this.recoverable = opts.recoverable;
    this.status = opts.status;
    this.platform = opts.platform;
  }
}
