import { Platform } from '@postpilot/db';

/**
 * Publishing configuration. Visibility defaults are intentionally conservative
 * so publishing works within unaudited/sandbox limits and never violates
 * platform rules — flip them once your apps pass review.
 *
 *   TIKTOK_DEFAULT_PRIVACY    PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | SELF_ONLY
 *                             (unaudited apps can only use SELF_ONLY)
 *   YOUTUBE_DEFAULT_PRIVACY   private | unlisted | public
 *                             (unverified projects are forced to private)
 *   Instagram has no API privacy control — Reels publish publicly.
 */
export type TikTokPrivacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
export type YouTubePrivacy = 'private' | 'unlisted' | 'public';

export const TIKTOK_DEFAULT_PRIVACY: TikTokPrivacy =
  (process.env.TIKTOK_DEFAULT_PRIVACY as TikTokPrivacy) || 'SELF_ONLY';

export const YOUTUBE_DEFAULT_PRIVACY: YouTubePrivacy =
  (process.env.YOUTUBE_DEFAULT_PRIVACY as YouTubePrivacy) || 'private';

/** Retry policy for transient (recoverable) publish failures. */
export const MAX_PUBLISH_ATTEMPTS = Number(process.env.PUBLISH_MAX_ATTEMPTS ?? 5);
/** Base backoff; delay = BASE * 2^(attempt-1), capped. */
export const BACKOFF_BASE_MS = Number(process.env.PUBLISH_BACKOFF_BASE_MS ?? 60_000);
export const BACKOFF_MAX_MS = Number(process.env.PUBLISH_BACKOFF_MAX_MS ?? 6 * 60 * 60_000);

/** How often to re-poll a PROCESSING task, and how many polls before timeout. */
export const POLL_INTERVAL_MS = Number(process.env.PUBLISH_POLL_INTERVAL_MS ?? 60_000);
export const MAX_POLLS = Number(process.env.PUBLISH_MAX_POLLS ?? 15);

/** Compute the next-attempt delay for a given (1-based) attempt number. */
export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

/** Instagram Graph base — "API with Instagram Login" uses graph.instagram.com. */
export const IG_GRAPH_BASE = process.env.IG_GRAPH_BASE ?? 'https://graph.instagram.com';
export const IG_GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v21.0';

export const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';
export const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

/** Human label per platform for messages. */
export const PLATFORM_NAME: Record<Platform, string> = {
  [Platform.TIKTOK]: 'TikTok',
  [Platform.INSTAGRAM]: 'Instagram',
  [Platform.YOUTUBE]: 'YouTube',
};
