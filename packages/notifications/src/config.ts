import { NotificationChannel, NotificationType } from '@postpilot/db';

/**
 * Notification routing + delivery config. One alerting system, several
 * channels:
 *   - in-app: every Notification row is itself the in-app alert (no delivery
 *     row needed).
 *   - EMAIL (Resend): all alerts. Reuses AUTH_RESEND_KEY + EMAIL_FROM.
 *   - PUSH (Expo): all alerts, to the user's registered devices.
 *   - SMS (Twilio): only the genuinely urgent "queue is stalled until you act"
 *     alerts, to keep cost/10DLC overhead down.
 */

/** Alert types urgent enough to justify an SMS. */
const SMS_TYPES: NotificationType[] = [
  NotificationType.RECONNECT_REQUIRED,
  NotificationType.QUEUE_EMPTY,
];

/** External channels to attempt for a given notification type. */
export function channelsFor(type: NotificationType): NotificationChannel[] {
  const channels: NotificationChannel[] = [NotificationChannel.EMAIL, NotificationChannel.PUSH];
  if (SMS_TYPES.includes(type)) channels.push(NotificationChannel.SMS);
  return channels;
}

/** Suppress re-sending the same alert (by dedupeKey) within this window. */
export const THROTTLE_WINDOW_MS = Number(process.env.NOTIFY_THROTTLE_MS ?? 6 * 60 * 60_000);

/** Queue-health: warn when estimated days of content remaining drops below this. */
export const QUEUE_LOW_THRESHOLD_DAYS = Number(process.env.QUEUE_LOW_THRESHOLD_DAYS ?? 7);

// --- provider configuration -------------------------------------------------

export const RESEND_API_KEY = process.env.AUTH_RESEND_KEY ?? '';
export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';

export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? '';
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? '';
export const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER ?? '';

/** Optional — Expo's push endpoint is public; a token only raises rate limits. */
export const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN ?? '';

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY && EMAIL_FROM);
}
export function isSmsConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}
/** Push needs no server key; it just needs device tokens (checked per-user). */
export function isPushConfigured(): boolean {
  return true;
}
