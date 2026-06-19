import { Platform } from '@saas/db';

import type { PlatformAdapter } from '../types';
import { tiktokAdapter } from './tiktok';
import { instagramAdapter } from './instagram';
import { youtubeAdapter } from './youtube';

const ADAPTERS: Record<Platform, PlatformAdapter> = {
  [Platform.TIKTOK]: tiktokAdapter,
  [Platform.INSTAGRAM]: instagramAdapter,
  [Platform.YOUTUBE]: youtubeAdapter,
};

/** All supported platforms, in display order. */
export const SUPPORTED_PLATFORMS: Platform[] = [
  Platform.TIKTOK,
  Platform.INSTAGRAM,
  Platform.YOUTUBE,
];

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`No adapter registered for platform ${platform}`);
  return adapter;
}

/** Whether the OAuth client env vars for a platform are present. */
export function isPlatformConfigured(platform: Platform): boolean {
  return getAdapter(platform).isConfigured();
}

export { tiktokAdapter, instagramAdapter, youtubeAdapter };
