import { type NotificationType, type Platform, type PrismaClient } from '@postpilot/db';

/**
 * Create a notification, deduplicated on `dedupeKey` while one is still PENDING
 * (so a burst of identical events yields a single alert). The dispatcher then
 * fans it out to the channels and also throttles repeats over time.
 */
export async function createNotification(
  prisma: PrismaClient,
  params: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    platform?: Platform;
    relatedVideoId?: string;
    relatedConnectionId?: string;
    dedupeKey: string;
  },
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: { userId: params.userId, dedupeKey: params.dedupeKey, status: 'PENDING' },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      platform: params.platform ?? null,
      relatedVideoId: params.relatedVideoId ?? null,
      relatedConnectionId: params.relatedConnectionId ?? null,
      dedupeKey: params.dedupeKey,
    },
  });
  return true;
}
