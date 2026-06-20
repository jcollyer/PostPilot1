import { NotificationChannel, prisma } from '@saas/db';

import { sendEmail, sendPush, sendSms } from './channels';
import { channelsFor, isEmailConfigured, isSmsConfigured, THROTTLE_WINDOW_MS } from './config';

export interface DispatchResult {
  processed: number;
  delivered: number;
  failed: number;
  suppressed: number;
}

/** SMS bodies stay short; in-app/email/push carry the full body. */
function smsBody(title: string): string {
  return `${title} — open PostPilot to act.`.slice(0, 320);
}

/** Record one channel attempt (idempotent on notificationId+channel). */
async function recordDelivery(
  notificationId: string,
  channel: NotificationChannel,
  outcome: { ok: boolean; providerMessageId?: string; error?: string },
) {
  await prisma.notificationDelivery.upsert({
    where: { notificationId_channel: { notificationId, channel } },
    create: {
      notificationId,
      channel,
      status: outcome.ok ? 'SENT' : 'FAILED',
      providerMessageId: outcome.providerMessageId ?? null,
      error: outcome.error ?? null,
      sentAt: outcome.ok ? new Date() : null,
    },
    update: {
      status: outcome.ok ? 'SENT' : 'FAILED',
      providerMessageId: outcome.providerMessageId ?? null,
      error: outcome.error ?? null,
      sentAt: outcome.ok ? new Date() : null,
    },
  });
}

/**
 * Deliver PENDING notifications across their routed channels. In-app delivery
 * is implicit (the row itself); this fans out EMAIL/PUSH/SMS, dedupe-throttles
 * repeats of the same alert, and updates each notification's status.
 */
export async function dispatchPending(opts?: { limit?: number }): Promise<DispatchResult> {
  const now = Date.now();
  const notifications = await prisma.notification.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: opts?.limit ?? 50,
    include: {
      user: { select: { email: true, phoneNumber: true, devices: { select: { expoPushToken: true } } } },
    },
  });

  const result: DispatchResult = { processed: 0, delivered: 0, failed: 0, suppressed: 0 };

  for (const n of notifications) {
    result.processed++;

    // Respect an explicit throttle window.
    if (n.throttledUntil && n.throttledUntil.getTime() > now) continue;

    // Throttle repeats: same alert already sent recently → keep it in-app only.
    if (n.dedupeKey) {
      const recent = await prisma.notification.findFirst({
        where: {
          userId: n.userId,
          dedupeKey: n.dedupeKey,
          status: 'SENT',
          id: { not: n.id },
          updatedAt: { gte: new Date(now - THROTTLE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recent) {
        await prisma.notification.update({
          where: { id: n.id },
          data: { status: 'SUPPRESSED', throttledUntil: new Date(now + THROTTLE_WINDOW_MS) },
        });
        result.suppressed++;
        continue;
      }
    }

    const channels = channelsFor(n.type);
    const text = n.body ?? n.title;
    let attempted = 0;
    let anyOk = false;

    for (const channel of channels) {
      try {
        if (channel === NotificationChannel.EMAIL) {
          if (!isEmailConfigured() || !n.user.email) continue;
          attempted++;
          const id = await sendEmail({ to: n.user.email, subject: n.title, text });
          anyOk = true;
          await recordDelivery(n.id, channel, { ok: true, providerMessageId: id });
        } else if (channel === NotificationChannel.PUSH) {
          const tokens = n.user.devices.map((d) => d.expoPushToken);
          if (tokens.length === 0) continue;
          attempted++;
          const id = await sendPush({ tokens, title: n.title, body: text });
          anyOk = true;
          await recordDelivery(n.id, channel, { ok: true, providerMessageId: id });
        } else if (channel === NotificationChannel.SMS) {
          if (!isSmsConfigured() || !n.user.phoneNumber) continue;
          attempted++;
          const id = await sendSms({ to: n.user.phoneNumber, body: smsBody(n.title) });
          anyOk = true;
          await recordDelivery(n.id, channel, { ok: true, providerMessageId: id });
        }
      } catch (err) {
        await recordDelivery(n.id, channel, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // No external channel available (no providers/recipients) → in-app counts as delivered.
    const status = attempted > 0 && !anyOk ? 'FAILED' : 'SENT';
    await prisma.notification.update({
      where: { id: n.id },
      data: { status, throttledUntil: new Date(now + THROTTLE_WINDOW_MS) },
    });
    if (status === 'SENT') result.delivered++;
    else result.failed++;
  }

  return result;
}
