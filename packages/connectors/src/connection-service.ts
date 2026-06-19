import { Platform, prisma, type PlatformConnection } from '@saas/db';

import { getAdapter, isPlatformConfigured, SUPPORTED_PLATFORMS } from './adapters';
import { decryptNullable, decryptSecret, generateCodeVerifier, generateState } from './crypto';
import { getRedirectUri } from './config';
import { needsRefresh, tokenColumns } from './tokens';
import { refreshConnection } from './refresh-service';

export interface PendingAuthorization {
  url: string;
  state: string;
  codeVerifier?: string;
  redirectUri: string;
}

/**
 * Begin a connect flow: produce the platform authorization URL plus the
 * `state` (and PKCE `codeVerifier` for TikTok) that the caller must stash in a
 * signed/encrypted cookie and verify on callback.
 */
export function startConnection(platform: Platform, origin?: string): PendingAuthorization {
  const adapter = getAdapter(platform);
  if (!adapter.isConfigured()) {
    throw new Error(`${platform} is not configured (missing OAuth client env vars).`);
  }
  const state = generateState();
  const codeVerifier = adapter.usesPkce ? generateCodeVerifier() : undefined;
  const redirectUri = getRedirectUri(platform, origin);
  const { url } = adapter.getAuthorizationUrl({ redirectUri, state, codeVerifier });
  return { url, state, codeVerifier, redirectUri };
}

/**
 * Finish a connect flow: exchange the code, fetch identity, and upsert the
 * connection with encrypted tokens. Re-connecting an existing account clears
 * any prior NEEDS_RECONNECT state.
 */
export async function completeConnection(params: {
  userId: string;
  platform: Platform;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<PlatformConnection> {
  const adapter = getAdapter(params.platform);
  const { tokens, identity } = await adapter.exchangeCode({
    code: params.code,
    redirectUri: params.redirectUri,
    codeVerifier: params.codeVerifier,
  });
  const cols = tokenColumns(tokens);

  return prisma.platformConnection.upsert({
    where: {
      userId_platform_externalAccountId: {
        userId: params.userId,
        platform: params.platform,
        externalAccountId: identity.externalAccountId,
      },
    },
    create: {
      userId: params.userId,
      platform: params.platform,
      externalAccountId: identity.externalAccountId,
      username: identity.username ?? null,
      displayName: identity.displayName ?? null,
      status: 'ACTIVE',
      lastRefreshedAt: new Date(),
      ...cols,
    },
    update: {
      username: identity.username ?? null,
      displayName: identity.displayName ?? null,
      status: 'ACTIVE',
      needsReconnectSince: null,
      lastError: null,
      lastRefreshedAt: new Date(),
      ...cols,
    },
  });
}

/** Disconnect (best-effort remote revoke, then delete the row). */
export async function disconnectConnection(params: {
  userId: string;
  connectionId: string;
}): Promise<void> {
  const conn = await prisma.platformConnection.findFirst({
    where: { id: params.connectionId, userId: params.userId },
  });
  if (!conn) throw new Error('Connection not found.');

  const adapter = getAdapter(conn.platform);
  if (adapter.revoke) {
    try {
      await adapter.revoke({
        accessToken: decryptNullable(conn.accessToken),
        refreshToken: decryptNullable(conn.refreshToken),
      });
    } catch {
      // Best effort — proceed with local deletion regardless.
    }
  }

  await prisma.platformConnection.delete({ where: { id: conn.id } });
}

/**
 * Return a valid (auto-refreshed if near expiry) access token for a connection.
 * Used by the publishing engine. Throws if the connection isn't ACTIVE — the
 * caller should then hold the affected work.
 */
export async function getFreshAccessToken(connectionId: string): Promise<string> {
  let conn = await prisma.platformConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (conn.status !== 'ACTIVE') {
    throw new Error(`Connection ${connectionId} is ${conn.status}, not ACTIVE.`);
  }
  const adapter = getAdapter(conn.platform);
  if (needsRefresh(conn, adapter.refreshLeadMs)) {
    conn = await refreshConnection(conn);
  }
  if (!conn.accessToken) throw new Error('Connection has no access token.');
  return decryptSecret(conn.accessToken);
}

// ---------------------------------------------------------------------------
// Safe DTOs (never expose tokens to clients)
// ---------------------------------------------------------------------------

export interface ConnectionDto {
  id: string;
  platform: Platform;
  status: PlatformConnection['status'];
  username: string | null;
  displayName: string | null;
  needsReconnectSince: Date | null;
  lastRefreshedAt: Date | null;
  accessTokenExpiresAt: Date | null;
  createdAt: Date;
}

export function toConnectionDto(conn: PlatformConnection): ConnectionDto {
  return {
    id: conn.id,
    platform: conn.platform,
    status: conn.status,
    username: conn.username,
    displayName: conn.displayName,
    needsReconnectSince: conn.needsReconnectSince,
    lastRefreshedAt: conn.lastRefreshedAt,
    accessTokenExpiresAt: conn.accessTokenExpiresAt,
    createdAt: conn.createdAt,
  };
}

export interface PlatformOverviewEntry {
  platform: Platform;
  configured: boolean;
  connection: ConnectionDto | null;
}

/** Per-platform connect/health summary for the settings + dashboard UI. */
export async function getConnectionOverview(userId: string): Promise<PlatformOverviewEntry[]> {
  const conns = await prisma.platformConnection.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  const byPlatform = new Map<Platform, PlatformConnection>();
  for (const c of conns) if (!byPlatform.has(c.platform)) byPlatform.set(c.platform, c);

  return SUPPORTED_PLATFORMS.map((platform) => {
    const conn = byPlatform.get(platform);
    return {
      platform,
      configured: isPlatformConfigured(platform),
      connection: conn ? toConnectionDto(conn) : null,
    };
  });
}
