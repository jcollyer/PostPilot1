import { TRPCError } from '@trpc/server';
import { Platform, type PrismaClient } from '@postpilot/db';
import {
  addVideosToQueueSchema,
  createScheduleSchema,
  evaluateTikTokRequirements,
  moveQueueItemSchema,
  queueItemIdSchema,
  retryPublishSchema,
  scheduleIdSchema,
  type TikTokPrivacyLevel,
  updateScheduleSchema,
  upcomingSchema,
} from '@postpilot/types';
import {
  appendPosition,
  ensureQueue,
  getUpcoming,
  positionBetween,
  recomputeSchedule,
  smartArrangeQueue,
} from '@postpilot/queue';

import { protectedProcedure, router } from '../trpc';

/** Resolve (creating if needed) the caller's single queue. */
function userQueue(prisma: PrismaClient, userId: string) {
  return ensureQueue(prisma, userId);
}

/** Assert an item belongs to the caller's queue, returning it. */
async function ownedItem(prisma: PrismaClient, queueId: string, itemId: string) {
  const item = await prisma.queueItem.findFirst({ where: { id: itemId, queueId } });
  if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Queue item not found.' });
  return item;
}

export const queueRouter = router({
  /** The queue: status + ordered items with their per-platform publish tasks. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    const items = await ctx.prisma.queueItem.findMany({
      where: { queueId: queue.id },
      orderBy: { position: 'asc' },
      include: {
        video: {
          select: {
            id: true,
            title: true,
            originalFilename: true,
            durationSec: true,
            coverImageUrl: true,
            selectedThumbnail: { select: { url: true } },
            category: { select: { name: true, color: true } },
            isDuplicate: true,
          },
        },
        publishTasks: {
          select: {
            id: true,
            platform: true,
            status: true,
            scheduledAt: true,
            connectionId: true,
            platformPostUrl: true,
            lastError: true,
          },
          orderBy: { platform: 'asc' },
        },
      },
    });

    return {
      status: queue.status,
      pausedAt: queue.pausedAt,
      items: items.map((it) => ({
        id: it.id,
        position: it.position,
        status: it.status,
        scheduledAt: it.scheduledAt,
        video: {
          id: it.video.id,
          title: it.video.title,
          originalFilename: it.video.originalFilename,
          durationSec: it.video.durationSec,
          thumbnailUrl: it.video.coverImageUrl ?? it.video.selectedThumbnail?.url ?? null,
          category: it.video.category,
          isDuplicate: it.video.isDuplicate,
        },
        tasks: it.publishTasks.map((t) => ({
          id: t.id,
          platform: t.platform,
          status: t.status,
          scheduledAt: t.scheduledAt,
          postUrl: t.platformPostUrl,
          lastError: t.lastError,
          needsConnection: t.status === 'HELD' || !t.connectionId,
        })),
      })),
    };
  }),

  /**
   * Append READY videos to the queue. Skips ones already queued, not ready, or
   * blocked because they still need TikTok details (only when TikTok is
   * connected). Returns counts so the client can explain what happened.
   */
  addVideos: protectedProcedure.input(addVideosToQueueSchema).mutation(async ({ ctx, input }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);

    const tiktokConnected = Boolean(
      await ctx.prisma.platformConnection.findFirst({
        where: { userId: ctx.userId, platform: Platform.TIKTOK, status: 'ACTIVE' },
        select: { id: true },
      }),
    );

    const videos = await ctx.prisma.video.findMany({
      where: { id: { in: input.videoIds }, userId: ctx.userId, status: 'READY' },
      select: {
        id: true,
        platformMeta: {
          where: { platform: Platform.TIKTOK },
          select: {
            tiktokPrivacy: true,
            tiktokAllowComment: true,
            tiktokAllowDuet: true,
            tiktokAllowStitch: true,
            tiktokCommercial: true,
            tiktokBrandOrganic: true,
            tiktokBrandedContent: true,
          },
        },
      },
    });
    const existing = await ctx.prisma.queueItem.findMany({
      where: { queueId: queue.id, videoId: { in: input.videoIds } },
      select: { videoId: true },
    });
    const already = new Set(existing.map((e) => e.videoId));

    // Block videos that still require TikTok input (privacy not chosen, etc.).
    const needsInput = (v: (typeof videos)[number]): boolean => {
      if (!tiktokConnected) return false;
      const m = v.platformMeta[0];
      return (
        evaluateTikTokRequirements({
          privacy: (m?.tiktokPrivacy as TikTokPrivacyLevel | null) ?? null,
          allowComment: m?.tiktokAllowComment ?? false,
          allowDuet: m?.tiktokAllowDuet ?? false,
          allowStitch: m?.tiktokAllowStitch ?? false,
          commercialDisclosure: m?.tiktokCommercial ?? false,
          brandOrganic: m?.tiktokBrandOrganic ?? false,
          brandedContent: m?.tiktokBrandedContent ?? false,
        }).length > 0
      );
    };

    const blocked = videos.filter((v) => !already.has(v.id) && needsInput(v));
    const toAdd = videos.filter((v) => !already.has(v.id) && !needsInput(v));

    let maxPos =
      (
        await ctx.prisma.queueItem.aggregate({
          where: { queueId: queue.id },
          _max: { position: true },
        })
      )._max.position ?? 0;

    for (const v of toAdd) {
      maxPos = appendPosition(maxPos);
      await ctx.prisma.queueItem.create({
        data: { queueId: queue.id, videoId: v.id, position: maxPos, status: 'PENDING' },
      });
    }

    await recomputeSchedule(ctx.prisma, queue.id);
    return {
      added: toAdd.length,
      skipped: input.videoIds.length - toAdd.length,
      // Of the skipped, how many were held back for missing TikTok input.
      blocked: blocked.length,
    };
  }),

  /** Remove an item from the queue. */
  removeItem: protectedProcedure.input(queueItemIdSchema).mutation(async ({ ctx, input }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    await ownedItem(ctx.prisma, queue.id, input.itemId);
    await ctx.prisma.queueItem.delete({ where: { id: input.itemId } });
    await recomputeSchedule(ctx.prisma, queue.id);
    return { success: true as const };
  }),

  /** Reorder: place `itemId` right after `afterItemId` (null = front). */
  move: protectedProcedure.input(moveQueueItemSchema).mutation(async ({ ctx, input }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    await ownedItem(ctx.prisma, queue.id, input.itemId);

    const items = await ctx.prisma.queueItem.findMany({
      where: { queueId: queue.id },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    const others = items.filter((i) => i.id !== input.itemId);

    let newPos: number;
    if (input.afterItemId === null) {
      newPos = positionBetween(null, others[0]?.position ?? null);
    } else {
      const idx = others.findIndex((i) => i.id === input.afterItemId);
      if (idx < 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Anchor item not found.' });
      newPos = positionBetween(others[idx]!.position, others[idx + 1]?.position ?? null);
    }

    await ctx.prisma.queueItem.update({
      where: { id: input.itemId },
      data: { position: newPos },
    });
    await recomputeSchedule(ctx.prisma, queue.id);
    return { success: true as const };
  }),

  /** Skip an item — it won't be published, and later items shift up a slot. */
  skip: protectedProcedure.input(queueItemIdSchema).mutation(async ({ ctx, input }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    await ownedItem(ctx.prisma, queue.id, input.itemId);
    await ctx.prisma.publishTask.deleteMany({
      where: { queueItemId: input.itemId, status: { in: ['SCHEDULED', 'HELD'] } },
    });
    await ctx.prisma.queueItem.update({
      where: { id: input.itemId },
      data: { status: 'SKIPPED', scheduledAt: null },
    });
    await recomputeSchedule(ctx.prisma, queue.id);
    return { success: true as const };
  }),

  /** Put a previously-skipped item back into rotation. */
  unskip: protectedProcedure.input(queueItemIdSchema).mutation(async ({ ctx, input }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    const item = await ownedItem(ctx.prisma, queue.id, input.itemId);
    if (item.status === 'SKIPPED') {
      await ctx.prisma.queueItem.update({ where: { id: item.id }, data: { status: 'PENDING' } });
      await recomputeSchedule(ctx.prisma, queue.id);
    }
    return { success: true as const };
  }),

  /** Pause the whole queue (clears the future plan; nothing new is scheduled). */
  pause: protectedProcedure.mutation(async ({ ctx }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    await ctx.prisma.queue.update({
      where: { id: queue.id },
      data: { status: 'PAUSED', pausedAt: new Date() },
    });
    await recomputeSchedule(ctx.prisma, queue.id);
    return { success: true as const };
  }),

  /** Resume and re-materialize the schedule. */
  resume: protectedProcedure.mutation(async ({ ctx }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    await ctx.prisma.queue.update({
      where: { id: queue.id },
      data: { status: 'ACTIVE', pausedAt: null },
    });
    await recomputeSchedule(ctx.prisma, queue.id);
    return { success: true as const };
  }),

  /** Reorder to space similar content apart, then re-materialize. */
  smartArrange: protectedProcedure.mutation(async ({ ctx }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    const res = await smartArrangeQueue(ctx.prisma, queue.id);
    await recomputeSchedule(ctx.prisma, queue.id);
    return res;
  }),

  /** Retry a failed/held publish task — requeues it for the next worker run. */
  retryPublish: protectedProcedure.input(retryPublishSchema).mutation(async ({ ctx, input }) => {
    const task = await ctx.prisma.publishTask.findFirst({
      where: { id: input.taskId, queueItem: { queue: { userId: ctx.userId } } },
      select: { id: true, status: true, connectionId: true },
    });
    if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Publish task not found.' });
    if (task.status !== 'FAILED' && task.status !== 'HELD') {
      return { success: false as const, reason: 'not_retryable' as const };
    }
    await ctx.prisma.publishTask.update({
      where: { id: task.id },
      data: {
        // HELD tasks with no connection can't run until reconnected; the runner
        // will re-hold them, which is fine.
        status: 'SCHEDULED',
        attemptCount: 0,
        nextAttemptAt: null,
        lastError: null,
        scheduledAt: new Date(),
      },
    });
    return { success: true as const };
  }),

  /** Upcoming scheduled/held posts, soonest first. */
  upcoming: protectedProcedure.input(upcomingSchema).query(async ({ ctx, input }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    return getUpcoming(ctx.prisma, queue.id, { limit: input.limit });
  }),

  // --- Schedules -----------------------------------------------------------

  listSchedules: protectedProcedure.query(async ({ ctx }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    return ctx.prisma.schedule.findMany({
      where: { queueId: queue.id },
      orderBy: { createdAt: 'asc' },
    });
  }),

  createSchedule: protectedProcedure
    .input(createScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const queue = await userQueue(ctx.prisma, ctx.userId);
      const schedule = await ctx.prisma.schedule.create({
        data: {
          queueId: queue.id,
          name: input.name ?? null,
          timezone: input.timezone,
          daysOfWeek: input.daysOfWeek,
          times: input.times,
          platforms: input.platforms,
          isActive: input.isActive,
        },
      });
      await recomputeSchedule(ctx.prisma, queue.id);
      return schedule;
    }),

  updateSchedule: protectedProcedure
    .input(updateScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const queue = await userQueue(ctx.prisma, ctx.userId);
      const existing = await ctx.prisma.schedule.findFirst({
        where: { id: input.scheduleId, queueId: queue.id },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found.' });

      await ctx.prisma.schedule.update({
        where: { id: input.scheduleId },
        data: {
          ...(input.name !== undefined ? { name: input.name ?? null } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
          ...(input.times !== undefined ? { times: input.times } : {}),
          ...(input.platforms !== undefined ? { platforms: input.platforms } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await recomputeSchedule(ctx.prisma, queue.id);
      return { success: true as const };
    }),

  deleteSchedule: protectedProcedure.input(scheduleIdSchema).mutation(async ({ ctx, input }) => {
    const queue = await userQueue(ctx.prisma, ctx.userId);
    const existing = await ctx.prisma.schedule.findFirst({
      where: { id: input.scheduleId, queueId: queue.id },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found.' });
    await ctx.prisma.schedule.delete({ where: { id: input.scheduleId } });
    await recomputeSchedule(ctx.prisma, queue.id);
    return { success: true as const };
  }),
});
