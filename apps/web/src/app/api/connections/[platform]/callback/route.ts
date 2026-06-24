import { type NextRequest, NextResponse } from 'next/server';

import {
  completeConnection,
  decryptSecret,
  getRedirectUri,
  parsePlatform,
} from '@postpilot/connectors';

import { getServerSession } from '@/server/session';
import { resolveOrigin } from '@/server/request-origin';

const STATE_COOKIE = 'pp_oauth';

interface OAuthStateCookie {
  platform: string;
  state: string;
  codeVerifier?: string;
}

/**
 * OAuth callback. Verifies the state cookie, exchanges the authorization code
 * for tokens, persists the (encrypted) connection, and redirects back to the
 * connections settings page with a success/error flag.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform: platformParam } = await ctx.params;
  const origin = resolveOrigin(req);
  const settingsUrl = new URL('/settings/connections', origin);

  const finish = (clearCookie = true) => {
    const res = NextResponse.redirect(settingsUrl);
    if (clearCookie) res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/', origin));
  }

  const platform = parsePlatform(platformParam);
  if (!platform) {
    settingsUrl.searchParams.set('error', 'unknown_platform');
    return finish();
  }

  const url = new URL(req.url);

  // The platform may redirect back with its own error (user denied, etc.).
  const providerError = url.searchParams.get('error');
  if (providerError) {
    settingsUrl.searchParams.set('error', providerError);
    return finish();
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieRaw = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieRaw) {
    settingsUrl.searchParams.set('error', 'invalid_oauth_response');
    return finish();
  }

  let parsed: OAuthStateCookie;
  try {
    parsed = JSON.parse(decryptSecret(cookieRaw)) as OAuthStateCookie;
  } catch {
    settingsUrl.searchParams.set('error', 'invalid_state');
    return finish();
  }

  if (parsed.platform !== platform || parsed.state !== state) {
    settingsUrl.searchParams.set('error', 'state_mismatch');
    return finish();
  }

  try {
    await completeConnection({
      userId: session.user.id,
      platform,
      code,
      redirectUri: getRedirectUri(platform, origin),
      codeVerifier: parsed.codeVerifier,
    });
    settingsUrl.searchParams.set('connected', platform.toLowerCase());
  } catch {
    settingsUrl.searchParams.set('error', 'connect_failed');
  }

  return finish();
}
