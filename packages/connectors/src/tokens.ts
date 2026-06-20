import type { PlatformConnection } from '@postpilot/db';

import { encryptNullable } from './crypto';
import type { OAuthTokens } from './types';

/**
 * Map adapter `OAuthTokens` (plaintext) to the encrypted PlatformConnection
 * columns. Shared by both the connect and refresh paths so encryption happens
 * in exactly one place.
 */
export function tokenColumns(tokens: OAuthTokens) {
  return {
    accessToken: encryptNullable(tokens.accessToken),
    refreshToken: encryptNullable(tokens.refreshToken ?? null),
    tokenType: tokens.tokenType ?? null,
    scope: tokens.scope ?? null,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
  };
}

/** Whether the access token is within `leadMs` of expiring (or already has). */
export function needsRefresh(conn: PlatformConnection, leadMs: number): boolean {
  if (!conn.accessTokenExpiresAt) return false;
  return conn.accessTokenExpiresAt.getTime() - Date.now() <= leadMs;
}
