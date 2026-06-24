import { z } from 'zod';

import { Platform } from '@postpilot/db';
import {
  disconnectConnection,
  getConnectionOverview,
  getFreshAccessToken,
} from '@postpilot/connectors';
import { fetchTikTokCreatorInfo } from '@postpilot/publishing';

import { protectedProcedure, router } from '../trpc';

/**
 * Platform connections. The connect flow itself is a browser redirect handled
 * by `/api/connections/[platform]/start` + `/callback` (OAuth needs full-page
 * navigation and a state cookie); this router covers the data the UI reads and
 * the disconnect action. Tokens are never exposed — only safe DTOs.
 */
export const connectionsRouter = router({
  /** Per-platform connect/health summary (TikTok, Instagram, YouTube). */
  overview: protectedProcedure.query(({ ctx }) => getConnectionOverview(ctx.userId)),

  /** Disconnect an account (best-effort remote revoke, then removal). */
  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await disconnectConnection({ userId: ctx.userId, connectionId: input.connectionId });
      return { success: true as const };
    }),

  /**
   * Latest TikTok creator info for the "Post to TikTok" editor. TikTok's
   * guidelines require clients to fetch this when rendering the post page so the
   * privacy options, disabled interactions, and posting eligibility are current.
   *
   * Best-effort: returns `{ available: false }` when TikTok isn't connected or
   * the live call fails, so the editor can fall back to a safe default UI.
   */
  tiktokCreatorInfo: protectedProcedure.query(async ({ ctx }) => {
    const conn = await ctx.prisma.platformConnection.findFirst({
      where: { userId: ctx.userId, platform: Platform.TIKTOK, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!conn) return { available: false as const, reason: 'not_connected' as const };

    try {
      const token = await getFreshAccessToken(conn.id);
      const info = await fetchTikTokCreatorInfo(token);
      return { available: true as const, info };
    } catch {
      // Token refresh or the TikTok call failed — let the editor degrade.
      return { available: false as const, reason: 'unavailable' as const };
    }
  }),
});
