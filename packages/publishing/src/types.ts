import type { Platform } from '@postpilot/db';

/** Everything an adapter needs to publish one video to one platform. */
export interface PublishInput {
  /** Fresh, decrypted OAuth access token for the target connection. */
  accessToken: string;
  /** The connected account's platform id (TikTok open_id / IG user id / YT channel). */
  externalAccountId: string;
  /** Public CDN URL of the video (TikTok + Instagram fetch from this). */
  videoUrl: string;
  /** Lazily download the raw bytes (YouTube uploads the file directly). */
  getBytes: () => Promise<Buffer>;
  mimeType: string | null;
  fileSize: number | null;
  durationSec: number | null;
  /** Platform-tailored copy (already resolved: per-platform override or base). */
  title: string;
  caption: string;
  hashtags: string[];
  /** TikTok-only posting options the creator set in the editor (null elsewhere). */
  tiktok?: TikTokPublishOptions | null;
}

/** TikTok Direct Post options resolved from the video's TikTok platform-meta row. */
export interface TikTokPublishOptions {
  /** Creator-selected privacy level (validated against creator_info options). */
  privacy: string | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercialDisclosure: boolean;
  brandOrganic: boolean;
  brandedContent: boolean;
}

/** Result of an initial publish call. */
export interface PublishResult {
  /** PROCESSING means the platform is still ingesting → poll with the id below. */
  state: 'PROCESSING' | 'PUBLISHED';
  /** Handle to poll (TikTok publish_id / IG container id). */
  externalContainerId?: string | null;
  platformPostId?: string | null;
  platformPostUrl?: string | null;
}

/** Result of polling a PROCESSING task. */
export interface PollResult {
  state: 'PROCESSING' | 'PUBLISHED' | 'FAILED';
  platformPostId?: string | null;
  platformPostUrl?: string | null;
  error?: string;
}

export interface PollInput {
  accessToken: string;
  externalAccountId: string;
  containerId: string;
}

/**
 * The single abstraction the queue/runner knows: `Publish(Video)`. Each platform
 * implements it; the runner is platform-agnostic.
 */
export interface PublishAdapter {
  readonly platform: Platform;
  publish(input: PublishInput): Promise<PublishResult>;
  /** Optional — only platforms that return PROCESSING need to be polled. */
  poll?(input: PollInput): Promise<PollResult>;
}

/** Join caption + hashtags into one string (used by TikTok/IG). */
export function captionWithHashtags(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  return [caption.trim(), tags].filter(Boolean).join('\n\n').trim();
}
