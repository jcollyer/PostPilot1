import { Platform } from '@postpilot/db';

import type { PublishAdapter } from '../types';
import { tiktokPublishAdapter, fetchTikTokCreatorInfo, type TikTokCreatorInfo } from './tiktok';
import { instagramPublishAdapter } from './instagram';
import { youtubePublishAdapter } from './youtube';

const REGISTRY: Record<Platform, PublishAdapter> = {
  [Platform.TIKTOK]: tiktokPublishAdapter,
  [Platform.INSTAGRAM]: instagramPublishAdapter,
  [Platform.YOUTUBE]: youtubePublishAdapter,
};

/** The `Publish(Video)` adapter for a platform. */
export function getPublishAdapter(platform: Platform): PublishAdapter {
  return REGISTRY[platform];
}

export { tiktokPublishAdapter, instagramPublishAdapter, youtubePublishAdapter };
export { fetchTikTokCreatorInfo, type TikTokCreatorInfo };
