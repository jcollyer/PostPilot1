import type { NextRequest } from 'next/server';

/**
 * Resolve the public origin of the app, accounting for proxies (ngrok, Vercel,
 * Railway) where `req.url` may reflect an internal host. Prefers an explicit
 * env origin, then x-forwarded-* headers, then the request URL.
 */
export function resolveOrigin(req: NextRequest): string {
  const envOrigin = process.env.BETTER_AUTH_URL ?? process.env.AUTH_URL;
  if (envOrigin) return envOrigin.replace(/\/+$/, '');

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;

  return new URL(req.url).origin;
}
