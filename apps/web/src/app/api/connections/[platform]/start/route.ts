import { type NextRequest, NextResponse } from 'next/server';

import { encryptSecret, parsePlatform, startConnection } from '@postpilot/connectors';

import { getServerSession } from '@/server/session';
import { resolveOrigin } from '@/server/request-origin';

/** Cookie carrying the encrypted OAuth state between start and callback. */
const STATE_COOKIE = 'pp_oauth';

/**
 * Begin connecting a platform account. Redirects the browser to the platform's
 * authorization screen and stashes the anti-CSRF `state` (and PKCE verifier) in
 * a short-lived, encrypted, httpOnly cookie verified on callback.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ platform: string }> },
) {
  const { platform: platformParam } = await ctx.params;
  const origin = resolveOrigin(req);
  const settingsUrl = new URL('/settings/connections', origin);

  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/', origin));
  }

  const platform = parsePlatform(platformParam);
  if (!platform) {
    settingsUrl.searchParams.set('error', 'unknown_platform');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const { url, state, codeVerifier } = startConnection(platform, origin);
    const res = NextResponse.redirect(url);
    res.cookies.set(
      STATE_COOKIE,
      encryptSecret(JSON.stringify({ platform, state, codeVerifier })),
      {
        httpOnly: true,
        secure: origin.startsWith('https'),
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      },
    );
    return res;
  } catch {
    settingsUrl.searchParams.set('error', 'not_configured');
    return NextResponse.redirect(settingsUrl);
  }
}
