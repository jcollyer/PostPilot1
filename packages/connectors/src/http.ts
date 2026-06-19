import type { Platform } from '@saas/db';

import { OAuthError } from './types';

interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  /** Used in error messages. */
  context: string;
  platform?: Platform;
}

/**
 * Thin fetch wrapper that normalizes failures into `OAuthError` with a
 * recoverable/unrecoverable classification:
 *   - network failure        -> recoverable (retry later)
 *   - 408 / 429 / 5xx        -> recoverable (transient/rate-limited)
 *   - other 4xx (400/401/403)-> unrecoverable (bad grant/revoked creds)
 */
export async function requestJson<T>(url: string, opts: RequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
    });
  } catch {
    throw new OAuthError(`${opts.context}: network error`, {
      recoverable: true,
      platform: opts.platform,
    });
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const transient = res.status === 408 || res.status === 429 || res.status >= 500;
    throw new OAuthError(`${opts.context}: HTTP ${res.status} ${text.slice(0, 300)}`, {
      recoverable: transient,
      status: res.status,
      platform: opts.platform,
    });
  }

  return json as T;
}

export function formBody(params: Record<string, string | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.set(k, v);
  }
  return body;
}

export function buildUrl(base: string, params: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

export function expiresAt(seconds: number | undefined | null): Date | null {
  if (!seconds && seconds !== 0) return null;
  return new Date(Date.now() + Number(seconds) * 1000);
}
