import { prisma, type PrismaClient } from '@postpilot/db';

import { QUEUE_LOW_THRESHOLD_DAYS } from './config';
import { createNotification } from './notify';

export interface QueueHealth {
  remaining: number;
  postsPerDay: number;
  daysRemaining: number | null;
  estimatedEmptyDate: Date | null;
}

/**
 * Compute queue-health metrics for one queue: how many videos remain, the
 * posting cadence implied by active schedules, and when the queue will run dry.
 * Reused by the dashboard (Chunk 9) and the alert producer below.
 */
export async function computeQueueHealth(
  client: PrismaClient,
  queueId: string,
): Promise<QueueHealth> {
  const schedules = await client.schedule.findMany({
    where: { queueId, isActive: true },
    select: { daysOfWeek: true, times: true },
  });
  const postsPerWeek = schedules.reduce((sum, s) => sum + s.daysOfWeek.length * s.times.length, 0);
  const postsPerDay = postsPerWeek / 7;

  const remaining = await client.queueItem.count({
    where: { queueId, status: { in: ['PENDING', 'SCHEDULED'] } },
  });

  if (postsPerDay <= 0) {
    return { remaining, postsPerDay: 0, daysRemaining: null, estimatedEmptyDate: null };
  }
  const daysRemaining = remaining / postsPerDay;
  return {
    remaining,
    postsPerDay,
    daysRemaining,
    estimatedEmptyDate: new Date(Date.now() + daysRemaining * 86_400_000),
  };
}

/**
 * Emit QUEUE_LOW / QUEUE_EMPTY alerts (states of the same alerting system) for
 * every active queue that has a posting cadence. Deduped per user; the
 * dispatcher delivers them.
 */
export async function runQueueHealthChecks(): Promise<{ checked: number; alerts: number }> {
  const queues = await prisma.queue.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, userId: true },
  });

  let alerts = 0;
  for (const queue of queues) {
    const health = await computeQueueHealth(prisma, queue.id);
    if (health.postsPerDay <= 0) continue; // no schedule → no cadence to run dry

    if (health.remaining === 0) {
      const created = await createNotification(prisma, {
        userId: queue.userId,
        type: 'QUEUE_EMPTY',
        title: 'Your queue is empty',
        body: 'PostPilot has run out of videos to post. Upload more and add them to the queue to keep publishing.',
        dedupeKey: `queue_empty:${queue.userId}`,
      });
      if (created) alerts++;
    } else if (health.daysRemaining !== null && health.daysRemaining <= QUEUE_LOW_THRESHOLD_DAYS) {
      const days = Math.max(1, Math.round(health.daysRemaining));
      const when = health.estimatedEmptyDate?.toDateString() ?? 'soon';
      const created = await createNotification(prisma, {
        userId: queue.userId,
        type: 'QUEUE_LOW',
        title: `Queue running low — about ${days} day${days === 1 ? '' : 's'} left`,
        body: `Around ${health.remaining} videos remain (empty ~${when}). Upload more soon so posting never stops.`,
        dedupeKey: `queue_low:${queue.userId}`,
      });
      if (created) alerts++;
    }
  }

  return { checked: queues.length, alerts };
}
