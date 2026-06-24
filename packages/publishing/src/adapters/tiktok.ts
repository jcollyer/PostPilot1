import { Platform } from '@postpilot/db';

import { TIKTOK_API_BASE, TIKTOK_DEFAULT_PRIVACY, type TikTokPrivacy } from '../config';
import { fetchJson, PublishError } from '../http';
import {
  captionWithHashtags,
  type PublishAdapter,
  type PollInput,
  type PublishInput,
} from '../types';

/**
 * TikTok Content Posting API — Direct Post via PULL_FROM_URL (TikTok fetches the
 * file from our R2 CDN URL; the URL prefix must be verified in the TikTok dev
 * portal). Flow: creator_info → video/init → poll status/fetch.
 *
 * Unaudited apps may only post SELF_ONLY; we pick a privacy level that's
 * actually allowed for this creator, preferring the configured default.
 */

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
  };
}

interface TikTokEnvelope<T> {
  data: T;
  error?: { code?: string; message?: string };
}

/** TikTok returns 200 with an error envelope; classify it. */
function assertOk(env: { error?: { code?: string; message?: string } }, context: string) {
  const code = env.error?.code;
  if (!code || code === 'ok') return;
  const message = `${context}: ${code} ${env.error?.message ?? ''}`;
  if (code === 'access_token_invalid' || code === 'scope_not_authorized') {
    throw new PublishError(message, { needsReconnect: true, platform: Platform.TIKTOK });
  }
  if (code === 'rate_limit_exceeded' || code === 'internal_error') {
    throw new PublishError(message, { recoverable: true, platform: Platform.TIKTOK });
  }
  throw new PublishError(message, { rejected: true, platform: Platform.TIKTOK });
}

function pickPrivacy(options: string[] | undefined): TikTokPrivacy {
  const opts = options ?? [];
  if (opts.includes(TIKTOK_DEFAULT_PRIVACY)) return TIKTOK_DEFAULT_PRIVACY;
  if (opts.includes('SELF_ONLY')) return 'SELF_ONLY';
  return (opts[0] as TikTokPrivacy) ?? 'SELF_ONLY';
}

export const tiktokPublishAdapter: PublishAdapter = {
  platform: Platform.TIKTOK,

  async publish(input: PublishInput) {
    // 1. Query creator info for the allowed privacy levels.
    const creator = await fetchJson<TikTokEnvelope<{ privacy_level_options?: string[] }>>(
      `${TIKTOK_API_BASE}/post/publish/creator_info/query/`,
      {
        method: 'POST',
        headers: authHeaders(input.accessToken),
        context: 'tiktok creator_info',
        platform: Platform.TIKTOK,
      },
    );
    assertOk(creator, 'tiktok creator_info');
    const privacy = pickPrivacy(creator.data.privacy_level_options);

    // 2. Initialize the direct post, pulling the file from our CDN URL.
    const init = await fetchJson<TikTokEnvelope<{ publish_id?: string }>>(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: authHeaders(input.accessToken),
        context: 'tiktok video/init',
        platform: Platform.TIKTOK,
        body: JSON.stringify({
          post_info: {
            title: captionWithHashtags(input.caption || input.title, input.hashtags).slice(0, 2200),
            privacy_level: privacy,
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
          },
          source_info: { source: 'PULL_FROM_URL', video_url: input.videoUrl },
        }),
      },
    );
    assertOk(init, 'tiktok video/init');
    const publishId = init.data.publish_id;
    if (!publishId) {
      throw new PublishError('tiktok video/init: no publish_id returned', {
        rejected: true,
        platform: Platform.TIKTOK,
      });
    }
    return { state: 'PROCESSING' as const, externalContainerId: publishId };
  },

  async poll({ accessToken, containerId }: PollInput) {
    const res = await fetchJson<
      TikTokEnvelope<{
        status?: string;
        fail_reason?: string;
        publicaly_available_post_id?: string[];
      }>
    >(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      context: 'tiktok status/fetch',
      platform: Platform.TIKTOK,
      body: JSON.stringify({ publish_id: containerId }),
    });
    assertOk(res, 'tiktok status/fetch');

    const status = res.data.status;
    if (status === 'PUBLISH_COMPLETE') {
      const postId = res.data.publicaly_available_post_id?.[0] ?? null;
      return { state: 'PUBLISHED' as const, platformPostId: postId };
    }
    if (status === 'FAILED') {
      return { state: 'FAILED' as const, error: res.data.fail_reason ?? 'TikTok reported FAILED' };
    }
    return { state: 'PROCESSING' as const };
  },
};
