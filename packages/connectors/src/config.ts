import { Platform } from '@postpilot/db';

/** Public origin of the web app, used to build OAuth redirect URIs. */
export function getBaseUrl(): string {
  return process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';
}

const REDIRECT_ENV: Record<Platform, string> = {
  [Platform.TIKTOK]: 'TIKTOK_REDIRECT_URI',
  [Platform.INSTAGRAM]: 'IG_REDIRECT_URI',
  [Platform.YOUTUBE]: 'YOUTUBE_REDIRECT_URI',
};

/**
 * The OAuth redirect URI for a platform. A platform-specific env override wins
 * (these must exactly match what's registered in each developer portal);
 * otherwise it falls back to `${origin}/api/connections/<platform>/callback`.
 */
export function getRedirectUri(platform: Platform, origin?: string): string {
  const override = process.env[REDIRECT_ENV[platform]];
  if (override) return override;
  const base = (origin ?? getBaseUrl()).replace(/\/+$/, '');
  return `${base}/api/connections/${platform.toLowerCase()}/callback`;
}

/** Parse a route param like "tiktok" into a Platform, or null if unknown. */
export function parsePlatform(value: string): Platform | null {
  const upper = value.toUpperCase();
  return (Object.values(Platform) as string[]).includes(upper) ? (upper as Platform) : null;
}
