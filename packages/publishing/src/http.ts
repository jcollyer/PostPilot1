import { Platform } from '@postpilot/db';

/**
 * Failure raised by publish adapters, classified so the runner knows how to
 * react:
 *   - needsReconnect → auth is dead (401/403/invalid_grant): pause the platform
 *     and ask the user to reconnect (other platforms keep going).
 *   - rejected       → the platform refused the content (bad 4xx/validation):
 *     terminal FAILED, surfaced as "content rejected".
 *   - recoverable    → transient (network, 408/429/5xx): retry with backoff.
 */
export class PublishError extends Error {
  readonly recoverable: boolean;
  readonly needsReconnect: boolean;
  readonly rejected: boolean;
  readonly status?: number;
  readonly platform?: Platform;

  constructor(
    message: string,
    opts: {
      recoverable?: boolean;
      needsReconnect?: boolean;
      rejected?: boolean;
      status?: number;
      platform?: Platform;
    } = {},
  ) {
    super(message);
    this.name = 'PublishError';
    this.needsReconnect = opts.needsReconnect ?? false;
    this.rejected = opts.rejected ?? false;
    this.recoverable = opts.recoverable ?? (!this.needsReconnect && !this.rejected);
    this.status = opts.status;
    this.platform = opts.platform;
  }
}

/** Build a classified PublishError from an HTTP status + body. */
export function errorFromStatus(
  context: string,
  status: number,
  body: string,
  platform?: Platform,
): PublishError {
  const snippet = body.slice(0, 400);
  const msg = `${context}: HTTP ${status} ${snippet}`;
  if (status === 401 || status === 403) {
    return new PublishError(msg, { needsReconnect: true, status, platform });
  }
  if (status === 408 || status === 429 || status >= 500) {
    return new PublishError(msg, { recoverable: true, status, platform });
  }
  // Other 4xx: the request/content was rejected and won't succeed on retry.
  return new PublishError(msg, { rejected: true, status, platform });
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array;
  context: string;
  platform?: Platform;
}

/** fetch returning the raw Response, normalizing network errors to recoverable. */
export async function rawFetch(url: string, opts: RequestOptions): Promise<Response> {
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      // Buffer extends Uint8Array; both (and string) are valid fetch bodies.
      // Cast to the ambient fetch body type so this compiles under both the
      // Node lib (server packages) and the DOM lib (when this package is pulled
      // into the web app's typecheck), which model `BodyInit` differently.
      body: opts.body as unknown as RequestInit['body'],
    });
  } catch (err) {
    throw new PublishError(`${opts.context}: network error ${(err as Error)?.message ?? ''}`, {
      recoverable: true,
      platform: opts.platform,
    });
  }
}

/** fetch + JSON parse, throwing a classified PublishError on non-2xx. */
export async function fetchJson<T>(url: string, opts: RequestOptions): Promise<T> {
  const res = await rawFetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw errorFromStatus(opts.context, res.status, text, opts.platform);
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new PublishError(`${opts.context}: invalid JSON response`, {
      recoverable: false,
      platform: opts.platform,
    });
  }
}
