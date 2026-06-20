import { type Platform, type PrismaClient, type NotificationType } from '@postpilot/db';

import { PLATFORM_NAME } from './config';

/**
 * Create a notification row, deduplicated on `dedupeKey` while still PENDING so
 * we never spam one-per-failed-video. The send side (Resend/Expo/Twilio) is
 * Chunk 8 — here we only record the alert.
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
    dedupeKey: string;
  },
): Promise<void> {
  const existing = await prisma.notification.findFirst({
    where: { userId: params.userId, dedupeKey: params.dedupeKey, status: 'PENDING' },
    select: { id: true },
  });
  if (existing) return;

  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      platform: params.platform ?? null,
      relatedVideoId: params.relatedVideoId ?? null,
      dedupeKey: params.dedupeKey,
    },
  });
}

export function publishFailedNotification(platform: Platform) {
  return {
    type: 'PUBLISH_FAILED' as NotificationType,
    title: `Couldn't post to ${PLATFORM_NAME[platform]}`,
    body: `A video couldn't be published to ${PLATFORM_NAME[platform]} after several attempts. It's been left in place so nothing is lost.`,
  };
}

export function contentRejectedNotification(platform: Platform) {
  return {
    type: 'CONTENT_REJECTED' as NotificationType,
    title: `${PLATFORM_NAME[platform]} rejected a video`,
    body: `${PLATFORM_NAME[platform]} rejected a video during publishing. Open the queue to review it.`,
  };
}
