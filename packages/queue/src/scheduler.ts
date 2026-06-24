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
 * The platforms a queue item should actually publish to in a given slot.
 *
 * Combines two scopes:
 *   - the slot's scope (its schedule's `platforms`, or all connected when empty)
 *   - the video's own `targetPlatforms` (empty = "all connected", the default)
 *
 * When the video names explicit targets we honor exactly those (intersected
 * with the slot's scope if the slot is platform-specific), so a platform the
 * user picked but hasn't connected still yields a HELD task and stays visible
 * rather than being silently dropped. When the video leaves it default, we fall
 * back to the slot's resolved scope — i.e. the previous cross-post behavior.
 */
function platformsForItem(
  slot: Slot,
  connectedPlatforms: Platform[],
  videoTargets: Platform[],
): Platform[] {
  if (videoTargets.length === 0) {
    return resolvePlatforms(slot, connectedPlatforms);
  }
  // Slot scoped to specific platforms: keep only targets the slot allows.
  if (slot.platforms.length > 0) {
    return videoTargets.filter((p) => slot.platforms.includes(p));
  }
  // Slot covers "all": the video's explicit choice wins outright.
  return videoTargets;
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
    select: { id: true, video: { select: { targetPlatforms: true } } },
  });

  let scheduledItems = 0;
  let tasks = 0;

  // Greedy assignment: walk slots in time order and give each to the
  // earliest-positioned not-yet-scheduled item that can publish to ≥1 platform
  // in that slot. This keeps queue order in the common case (one all-platforms
  // schedule -> every item is compatible, so it degrades to 1:1 by index) while
  // letting a platform-scoped item skip a slot it can't use rather than burning
  // it on a no-op.
  const used = new Set<string>();

  for (const slot of slots) {
    let chosen: { id: string; platforms: Platform[] } | null = null;
    for (const item of items) {
      if (used.has(item.id)) continue;
      const platforms = platformsForItem(slot, connectedPlatforms, item.video.targetPlatforms);
      if (platforms.length === 0) continue;
      chosen = { id: item.id, platforms };
      break;
    }
    if (!chosen) continue;

    used.add(chosen.id);
    await prisma.queueItem.update({
      where: { id: chosen.id },
      data: { status: 'SCHEDULED', scheduledAt: slot.at },
    });
    scheduledItems++;

    for (const platform of chosen.platforms) {
      const connectionId = connected.get(platform) ?? null;
      await prisma.publishTask.create({
        data: {
          queueItemId: chosen.id,
          platform,
          connectionId,
          status: connectionId ? 'SCHEDULED' : 'HELD',
          scheduledAt: slot.at,
        },
      });
      tasks++;
    }

    if (used.size >= items.length) break;
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
            select: {
              title: true,
              coverImageUrl: true,
              selectedThumbnail: { select: { url: true } },
            },
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
    thumbnailUrl:
      t.queueItem.video.coverImageUrl ?? t.queueItem.video.selectedThumbnail?.url ?? null,
    platform: t.platform,
    scheduledAt: t.scheduledAt,
    status: t.status,
    needsConnection: t.status === 'HELD' || !t.connectionId,
  }));
}
