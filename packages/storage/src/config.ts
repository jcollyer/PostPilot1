/**
 * Storage configuration for Cloudflare R2.
 *
 * R2 is S3-compatible, so the rest of this package talks to it through the AWS
 * S3 SDK pointed at R2's endpoint. Only this file knows it's R2.
 *
 * Required env:
 *   R2_ACCOUNT_ID          Cloudflare account id (used to derive the endpoint)
 *   R2_ACCESS_KEY_ID       R2 API token access key id
 *   R2_SECRET_ACCESS_KEY   R2 API token secret
 *   R2_BUCKET              bucket name
 *   R2_PUBLIC_BASE_URL     public origin the CDN serves the bucket from, e.g.
 *                          https://media.postpilot.app (no trailing slash).
 *                          IG/TikTok fetch the video file from URLs built on
 *                          this base, so it must be publicly reachable.
 * Optional env:
 *   R2_ENDPOINT            override the derived S3 API endpoint (advanced).
 */

export interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  endpoint: string;
  region: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Storage is not configured: missing env var ${name}.`);
  }
  return value;
}

/** True when every required storage env var is present. */
export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_BASE_URL,
  );
}

let cached: StorageConfig | null = null;

/** Resolve and cache the storage config, throwing if anything is missing. */
export function getStorageConfig(): StorageConfig {
  if (cached) return cached;

  const accountId = required('R2_ACCOUNT_ID');
  const endpoint =
    process.env.R2_ENDPOINT?.replace(/\/+$/, '') ?? `https://${accountId}.r2.cloudflarestorage.com`;

  cached = {
    accountId,
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET'),
    publicBaseUrl: required('R2_PUBLIC_BASE_URL').replace(/\/+$/, ''),
    endpoint,
    // R2 ignores the region but the S3 SDK requires one; "auto" is conventional.
    region: process.env.R2_REGION ?? 'auto',
  };
  return cached;
}

/** Build the public CDN URL a platform (or browser) fetches an object from. */
export function publicUrlForKey(key: string): string {
  const { publicBaseUrl } = getStorageConfig();
  return `${publicBaseUrl}/${key.replace(/^\/+/, '')}`;
}
