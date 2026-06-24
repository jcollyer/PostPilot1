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

/**
 * User-facing metadata for every notification type: a label, a short
 * description, and the external channels each type can fan out to. This is the
 * single source of truth for both routing (channelsFor) and the settings UI.
 */
export interface NotificationTypeMeta {
  type: NotificationType;
  label: string;
  description: string;
  channels: NotificationChannel[];
}

const BASE_CHANNELS: NotificationChannel[] = [NotificationChannel.EMAIL, NotificationChannel.PUSH];

function channelsForType(type: NotificationType): NotificationChannel[] {
  return SMS_TYPES.includes(type)
    ? [...BASE_CHANNELS, NotificationChannel.SMS]
    : [...BASE_CHANNELS];
}

export const NOTIFICATION_TYPE_META: NotificationTypeMeta[] = [
  {
    type: NotificationType.RECONNECT_REQUIRED,
    label: 'Reconnect required',
    description: 'A platform connection expired and needs you to reauthorize it.',
    channels: channelsForType(NotificationType.RECONNECT_REQUIRED),
  },
  {
    type: NotificationType.PUBLISH_FAILED,
    label: 'Publish failed',
    description: 'A scheduled post failed to publish.',
    channels: channelsForType(NotificationType.PUBLISH_FAILED),
  },
  {
    type: NotificationType.CONTENT_REJECTED,
    label: 'Content rejected',
    description: 'A platform rejected one of your posts.',
    channels: channelsForType(NotificationType.CONTENT_REJECTED),
  },
  {
    type: NotificationType.QUEUE_LOW,
    label: 'Queue running low',
    description: 'Your queue is about to run out of scheduled content.',
    channels: channelsForType(NotificationType.QUEUE_LOW),
  },
  {
    type: NotificationType.QUEUE_EMPTY,
    label: 'Queue empty',
    description: 'Your queue is empty — there is nothing left to publish.',
    channels: channelsForType(NotificationType.QUEUE_EMPTY),
  },
  {
    type: NotificationType.QUEUE_RESUMED,
    label: 'Queue resumed',
    description: 'Publishing resumed after being paused.',
    channels: channelsForType(NotificationType.QUEUE_RESUMED),
  },
  {
    type: NotificationType.SYSTEM,
    label: 'System announcements',
    description: 'Important account and product updates.',
    channels: channelsForType(NotificationType.SYSTEM),
  },
];

const CHANNELS_BY_TYPE = new Map<NotificationType, NotificationChannel[]>(
  NOTIFICATION_TYPE_META.map((m) => [m.type, m.channels]),
);

/** External channels to attempt for a given notification type. */
export function channelsFor(type: NotificationType): NotificationChannel[] {
  return CHANNELS_BY_TYPE.get(type) ?? [...BASE_CHANNELS];
}

/** A single per-type, per-channel preference override. */
export interface ChannelPreference {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

/**
 * Channels to attempt for a type after applying a user's explicit opt-outs.
 * Any (type, channel) pair the user disabled is removed from the default route;
 * everything else keeps the default behavior.
 */
export function channelsForUser(
  type: NotificationType,
  prefs: ChannelPreference[],
): NotificationChannel[] {
  const disabled = new Set(
    prefs.filter((p) => p.type === type && !p.enabled).map((p) => p.channel),
  );
  return channelsFor(type).filter((c) => !disabled.has(c));
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
