import { z } from 'zod';

import { disconnectConnection, getConnectionOverview } from '@saas/connectors';

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
});
