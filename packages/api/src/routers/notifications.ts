import { z } from 'zod';

import { protectedProcedure, router } from '../trpc';

/**
 * In-app notifications. Every alert PostPilot raises (reconnect needed, publish
 * failed, queue low/empty, …) is a Notification row; this router powers the
 * in-app bell. Email/push/SMS delivery happens in the notifications worker.
 * SUPPRESSED rows (throttled duplicates) are hidden from the inbox.
 */
export const notificationsRouter = router({
  /** Recent notifications, newest first, with cursor pagination. */
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.notification.findMany({
        where: { userId: ctx.userId, status: { not: 'SUPPRESSED' } },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          platform: true,
          readAt: true,
          createdAt: true,
          relatedConnectionId: true,
          relatedVideoId: true,
        },
      });
      let nextCursor: string | undefined;
      if (rows.length > input.limit) nextCursor = rows.pop()!.id;
      return { items: rows, nextCursor };
    }),

  /** Count of unread notifications (for the bell badge). */
  unreadCount: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.notification.count({
      where: { userId: ctx.userId, readAt: null, status: { not: 'SUPPRESSED' } },
    }),
  ),

  /** Mark one notification read. */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.notification.updateMany({
        where: { id: input.id, userId: ctx.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return { success: true as const };
    }),

  /** Mark all of the user's notifications read. */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.prisma.notification.updateMany({
      where: { userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count };
  }),
});
