import { getConnectionOverview } from '@saas/connectors';
import { computeQueueHealth } from '@saas/notifications';
import { ensureQueue } from '@saas/queue';

import { protectedProcedure, router } from '../trpc';

/** Lead time before the queue empties at which we nudge the user to upload. */
const RECOMMEND_UPLOAD_LEAD_DAYS = 14;

const videoSelect = {
  title: true,
  coverImageUrl: true,
  selectedThumbnail: { select: { url: true } },
} as const;

function thumb(v: { coverImageUrl: string | null; selectedThumbnail: { url: string | null } | null }) {
  return v.coverImageUrl ?? v.selectedThumbnail?.url ?? null;
}

/**
 * The minimal dashboard the brief calls for — queue remaining, days of content
 * left, next scheduled post, last published, and connected-account health. No
 * analytics, no charts. Shared by the web home page and the mobile monitor.
 */
export const dashboardRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const queue = await ensureQueue(ctx.prisma, ctx.userId);
    const health = await computeQueueHealth(ctx.prisma, queue.id);

    const recommendedUploadBy =
      health.estimatedEmptyDate != null
        ? new Date(health.estimatedEmptyDate.getTime() - RECOMMEND_UPLOAD_LEAD_DAYS * 86_400_000)
        : null;

    const [nextTask, lastTask, readyVideos, connections] = await Promise.all([
      ctx.prisma.publishTask.findFirst({
        where: { queueItem: { queueId: queue.id }, status: 'SCHEDULED', scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        select: { platform: true, scheduledAt: true, queueItem: { select: { video: { select: videoSelect } } } },
      }),
      ctx.prisma.publishTask.findFirst({
        where: { queueItem: { queueId: queue.id }, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: {
          platform: true,
          publishedAt: true,
          platformPostUrl: true,
          queueItem: { select: { video: { select: videoSelect } } },
        },
      }),
      ctx.prisma.video.count({ where: { userId: ctx.userId, status: 'READY' } }),
      getConnectionOverview(ctx.userId),
    ]);

    return {
      queueStatus: queue.status,
      health: {
        remaining: health.remaining,
        postsPerDay: health.postsPerDay,
        daysRemaining: health.daysRemaining,
        estimatedEmptyDate: health.estimatedEmptyDate,
        recommendedUploadBy,
      },
      readyVideos,
      nextPost: nextTask
        ? {
            platform: nextTask.platform,
            scheduledAt: nextTask.scheduledAt,
            title: nextTask.queueItem.video.title,
            thumbnailUrl: thumb(nextTask.queueItem.video),
          }
        : null,
      lastPublished: lastTask
        ? {
            platform: lastTask.platform,
            publishedAt: lastTask.publishedAt,
            postUrl: lastTask.platformPostUrl,
            title: lastTask.queueItem.video.title,
            thumbnailUrl: thumb(lastTask.queueItem.video),
          }
        : null,
      connections,
    };
  }),
});
