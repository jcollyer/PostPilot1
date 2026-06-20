import { type PrismaClient, type Platform } from '@postpilot/db';

import { generateSlots, type ScheduleRule, type Slot } from './slots';

/** Ensure the user has a Queue row (1:1) and return it. */
export async function ensureQueue(prisma: PrismaClient, userId: string) {
  return prisma.queue.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/** ACTIVE connection id per platform (first wins if somehow duplicated). */
async function activeConnections(
  prisma: PrismaClient,
  userId: string,
): Promise<Map<Platform, string>> {
  const conns = await prisma.platformConnection.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true, platform: true },
  });
  const map = new Map<Platform, string>();
  for (const c of conns) if (!map.has(c.platform)) map.set(c.platform, c.id);
  return map;
}

/** Resolve a slot's target platforms: explicit list, else all connected. */
function resolvePlatforms(slot: Slot, connected: Platform[]): Platform[] {
  return slot.platforms.length > 0 ? slot.platforms : connected;
}

/**
 * Recompute the schedule for a queue. Idempotent: clears future SCHEDULED tasks
 * (leaving in-flight/published/held-by-publishing ones alone), then walks the
 * queue in position order, assigning each PENDING item to the next usable slot
 * and creating one PublishTask per target platform (cross-post). A task whose
 * platform has no ACTIVE connection is created HELD so the UI can flag it.
 *
 * No-ops (just clears) when the queue is PAUSED or has no active schedules.
 * Pure DB work — safe to call from a request handler or the cron worker.
 */
export async function recomputeSchedule(
  prisma: PrismaClient,
  queueId: string,
): Promise<{ scheduledItems: number; tasks: number }> {
  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (!queue) return { scheduledItems: 0, tasks: 0 };

  // 1. Clear the future plan so this recompute is authoritative.
  await prisma.publishTask.deleteMany({
    where: { status: { in: ['SCHEDULED', 'HELD'] }, queueItem: { queueId } },
  });
  await prisma.queueItem.updateMany({
    where: { queueId, status: 'SCHEDULED' },
    data: { status: 'PENDING', scheduledAt: null },
  });

  if (queue.status === 'PAUSED') return { scheduledItems: 0, tasks: 0 };

  const schedules = await prisma.schedule.findMany({
    where: { queueId, isActive: true },
    select: { id: true, timezone: true, daysOfWeek: true, times: true, platforms: true },
  });
  if (schedules.length === 0) return { scheduledItems: 0, tasks: 0 };

  const connected = await activeConnections(prisma, queue.userId);
  const connectedPlatforms = [...connected.keys()];

  const now = new Date();
  const slots = generateSlots(schedules as ScheduleRule[], now).filter(
    (s) => resolvePlatforms(s, connectedPlatforms).length > 0,
  );
  if (slots.length === 0) return { scheduledItems: 0, tasks: 0 };

  const items = await prisma.queueItem.findMany({
    where: { queueId, status: 'PENDING' },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  let scheduledItems = 0;
  let tasks = 0;
  const count = Math.min(items.length, slots.length);

  for (let i = 0; i < count; i++) {
    const item = items[i]!;
    const slot = slots[i]!;
    const platforms = resolvePlatforms(slot, connectedPlatforms);

    await prisma.queueItem.update({
      where: { id: item.id },
      data: { status: 'SCHEDULED', scheduledAt: slot.at },
    });
    scheduledItems++;

    for (const platform of platforms) {
      const connectionId = connected.get(platform) ?? null;
      await prisma.publishTask.create({
        data: {
          queueItemId: item.id,
          platform,
          connectionId,
          status: connectionId ? 'SCHEDULED' : 'HELD',
          scheduledAt: slot.at,
        },
      });
      tasks++;
    }
  }

  return { scheduledItems, tasks };
}

/** Recompute the publish plan for every ACTIVE queue (cron entrypoint). */
export async function rescheduleAllActiveQueues(
  client: PrismaClient,
): Promise<{ queues: number; scheduledItems: number; tasks: number }> {
  const queues = await client.queue.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  let scheduledItems = 0;
  let tasks = 0;
  for (const q of queues) {
    const r = await recomputeSchedule(client, q.id);
    scheduledItems += r.scheduledItems;
    tasks += r.tasks;
  }
  return { queues: queues.length, scheduledItems, tasks };
}

export interface UpcomingPost {
  taskId: string;
  queueItemId: string;
  videoId: string;
  title: string | null;
  thumbnailUrl: string | null;
  platform: Platform;
  scheduledAt: Date;
  status: string;
  needsConnection: boolean;
}

/** Upcoming scheduled (and held) posts for a queue, soonest first. */
export async function getUpcoming(
  prisma: PrismaClient,
  queueId: string,
  opts?: { limit?: number },
): Promise<UpcomingPost[]> {
  const tasks = await prisma.publishTask.findMany({
    where: {
      queueItem: { queueId },
      status: { in: ['SCHEDULED', 'HELD'] },
      scheduledAt: { gte: new Date() },
    },
    orderBy: { scheduledAt: 'asc' },
    take: opts?.limit ?? 50,
    select: {
      id: true,
      status: true,
      platform: true,
      scheduledAt: true,
      connectionId: true,
      queueItemId: true,
      queueItem: {
        select: {
          videoId: true,
          video: {
            select: { title: true, coverImageUrl: true, selectedThumbnail: { select: { url: true } } },
          },
        },
      },
    },
  });

  return tasks.map((t) => ({
    taskId: t.id,
    queueItemId: t.queueItemId,
    videoId: t.queueItem.videoId,
    title: t.queueItem.video.title,
    thumbnailUrl: t.queueItem.video.coverImageUrl ?? t.queueItem.video.selectedThumbnail?.url ?? null,
    platform: t.platform,
    scheduledAt: t.scheduledAt,
    status: t.status,
    needsConnection: t.status === 'HELD' || !t.connectionId,
  }));
}
