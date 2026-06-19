import { Platform, prisma, type PlatformConnection } from '@saas/db';
import { PLATFORM_LABELS } from '@saas/types';

import { getAdapter, SUPPORTED_PLATFORMS } from './adapters';
import { decryptNullable } from './crypto';
import { needsRefresh, tokenColumns } from './tokens';
import { OAuthError } from './types';

/**
 * Refresh one connection's tokens.
 *
 * - On success: re-encrypts and stores the new tokens, preserving the existing
 *   refresh token when the platform doesn't rotate it (YouTube) and persisting
 *   the rotated one when it does (TikTok).
 * - On an UNRECOVERABLE failure (revoked, password change, invalid_grant): marks
 *   the connection NEEDS_RECONNECT and queues a deduplicated reconnect alert,
 *   then rethrows.
 * - On a transient failure: rethrows so the caller/cron retries later.
 */
export async function refreshConnection(conn: PlatformConnection): Promise<PlatformConnection> {
  const adapter = getAdapter(conn.platform);
  try {
    const tokens = await adapter.refreshTokens({
      accessToken: decryptNullable(conn.accessToken),
      refreshToken: decryptNullable(conn.refreshToken),
    });
    // Keep the current refresh token if the platform returned none.
    const refreshToken = tokens.refreshToken ?? decryptNullable(conn.refreshToken);
    return await prisma.platformConnection.update({
      where: { id: conn.id },
      data: {
        ...tokenColumns({ ...tokens, refreshToken }),
        status: 'ACTIVE',
        needsReconnectSince: null,
        lastError: null,
        lastRefreshedAt: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof OAuthError && !err.recoverable) {
      await markNeedsReconnect(conn, err.message);
    }
    throw err;
  }
}

/**
 * Per-platform graceful degradation: pause just this connection and queue a
 * single "Reconnect [Platform]" alert. Impacted publishing is held by the
 * publishing engine (which checks connection status); we never silently drop
 * anything here.
 */
export async function markNeedsReconnect(
  conn: PlatformConnection,
  reason: string,
): Promise<void> {
  const label = PLATFORM_LABELS[conn.platform as Platform];
  const dedupeKey = `reconnect:${conn.platform}:${conn.id}`;

  await prisma.$transaction(async (tx) => {
    await tx.platformConnection.update({
      where: { id: conn.id },
      data: {
        status: 'NEEDS_RECONNECT',
        needsReconnectSince: conn.needsReconnectSince ?? new Date(),
        lastError: reason.slice(0, 500),
      },
    });

    // Deduplicate: one pending reconnect notification per connection.
    const existing = await tx.notification.findFirst({
      where: { userId: conn.userId, dedupeKey, status: 'PENDING' },
      select: { id: true },
    });
    if (!existing) {
      await tx.notification.create({
        data: {
          userId: conn.userId,
          type: 'RECONNECT_REQUIRED',
          platform: conn.platform,
          title: `Reconnect ${label}`,
          body: `Your ${label} connection needs to be reconnected before posting can resume. Your other platforms are unaffected.`,
          dedupeKey,
          relatedConnectionId: conn.id,
        },
      });
    }
  });
}

/**
 * Cron entrypoint: refresh every ACTIVE connection whose access token is within
 * its platform's lead time of expiring. Each platform's tokens have very
 * different lifetimes (TikTok ~24h, YouTube ~1h, Instagram ~60d), so we filter
 * broadly in SQL and then apply each adapter's precise lead time.
 */
export async function refreshDueConnections(): Promise<
  Array<{ id: string; platform: Platform; ok: boolean; error?: string }>
> {
  const maxLeadMs = Math.max(
    ...SUPPORTED_PLATFORMS.map((p) => getAdapter(p).refreshLeadMs),
  );
  const candidates = await prisma.platformConnection.findMany({
    where: {
      status: 'ACTIVE',
      accessTokenExpiresAt: { not: null, lte: new Date(Date.now() + maxLeadMs) },
    },
  });

  const results: Array<{ id: string; platform: Platform; ok: boolean; error?: string }> = [];
  for (const conn of candidates) {
    const adapter = getAdapter(conn.platform);
    if (!needsRefresh(conn, adapter.refreshLeadMs)) continue;
    try {
      await refreshConnection(conn);
      results.push({ id: conn.id, platform: conn.platform, ok: true });
    } catch (err) {
      results.push({
        id: conn.id,
        platform: conn.platform,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
