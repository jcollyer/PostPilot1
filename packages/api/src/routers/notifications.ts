import { z } from 'zod';
import { NotificationChannel, NotificationType } from '@postpilot/db';
import { channelsFor, NOTIFICATION_TYPE_META } from '@postpilot/notifications';

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
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
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

  /**
   * Per-type delivery preferences for the settings UI. Returns the full matrix
   * (every type with its applicable channels) merged with the user's stored
   * opt-outs; absence of a stored row means the channel is enabled. `hasPhone`
   * lets the UI flag that SMS won't be delivered until a phone number is added.
   */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const [rows, user] = await Promise.all([
      ctx.prisma.notificationPreference.findMany({
        where: { userId: ctx.userId },
        select: { type: true, channel: true, enabled: true },
      }),
      ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { phoneNumber: true },
      }),
    ]);

    const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => `${r.type}:${r.channel}`));

    const types = NOTIFICATION_TYPE_META.map((m) => ({
      type: m.type,
      label: m.label,
      description: m.description,
      channels: m.channels.map((channel) => ({
        channel,
        enabled: !disabled.has(`${m.type}:${channel}`),
      })),
    }));

    return { types, hasPhone: Boolean(user?.phoneNumber) };
  }),

  /**
   * Upsert one or more (type, channel) preference overrides. Each pair is
   * validated against the type's applicable channels so the SMS-only-on-urgent
   * routing can't be bypassed.
   */
  setPreferences: protectedProcedure
    .input(
      z.object({
        updates: z
          .array(
            z.object({
              type: z.nativeEnum(NotificationType),
              channel: z.nativeEnum(NotificationChannel),
              enabled: z.boolean(),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      for (const u of input.updates) {
        if (!channelsFor(u.type).includes(u.channel)) {
          throw new Error(`Channel ${u.channel} is not available for ${u.type}`);
        }
      }

      await ctx.prisma.$transaction(
        input.updates.map((u) =>
          ctx.prisma.notificationPreference.upsert({
            where: {
              userId_type_channel: {
                userId: ctx.userId,
                type: u.type,
                channel: u.channel,
              },
            },
            create: {
              userId: ctx.userId,
              type: u.type,
              channel: u.channel,
              enabled: u.enabled,
            },
            update: { enabled: u.enabled },
          }),
        ),
      );

      return { success: true as const };
    }),
});
