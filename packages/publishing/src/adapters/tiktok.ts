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

/** Shape of the fields we surface from TikTok's `creator_info` endpoint. */
export interface TikTokCreatorInfo {
  creatorNickname: string | null;
  creatorUsername: string | null;
  creatorAvatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
  /** Derived: TikTok will accept a new post right now (has at least one privacy option). */
  canPost: boolean;
}

/**
 * Query the latest creator info for a connected TikTok account. API Clients
 * must call this when rendering the "Post to TikTok" page so the privacy
 * options, disabled interactions, and posting eligibility are always current.
 */
export async function fetchTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const res = await fetchJson<
    TikTokEnvelope<{
      creator_nickname?: string;
      creator_username?: string;
      creator_avatar_url?: string;
      privacy_level_options?: string[];
      comment_disabled?: boolean;
      duet_disabled?: boolean;
      stitch_disabled?: boolean;
      max_video_post_duration_sec?: number;
    }>
  >(`${TIKTOK_API_BASE}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    context: 'tiktok creator_info',
    platform: Platform.TIKTOK,
  });
  assertOk(res, 'tiktok creator_info');
  const d = res.data;
  const privacyLevelOptions = d.privacy_level_options ?? [];
  return {
    creatorNickname: d.creator_nickname ?? null,
    creatorUsername: d.creator_username ?? null,
    creatorAvatarUrl: d.creator_avatar_url ?? null,
    privacyLevelOptions,
    commentDisabled: d.comment_disabled ?? false,
    duetDisabled: d.duet_disabled ?? false,
    stitchDisabled: d.stitch_disabled ?? false,
    maxVideoPostDurationSec: d.max_video_post_duration_sec ?? null,
    canPost: privacyLevelOptions.length > 0,
  };
}

export const tiktokPublishAdapter: PublishAdapter = {
  platform: Platform.TIKTOK,

  async publish(input: PublishInput) {
    // 1. Query the latest creator info for the allowed privacy levels +
    //    interaction settings (the creator may have changed these in-app).
    const creator = await fetchTikTokCreatorInfo(input.accessToken);
    const opts = input.tiktok;

    // Honor the creator's chosen privacy if it's still an allowed option;
    // otherwise fall back to the safest configured default.
    const chosen = opts?.privacy;
    const privacy =
      chosen && creator.privacyLevelOptions.includes(chosen)
        ? (chosen as TikTokPrivacy)
        : pickPrivacy(creator.privacyLevelOptions);

    // Interactions default OFF; only enable when the user opted in AND TikTok
    // hasn't disabled that interaction for this creator.
    const disableComment = !(opts?.allowComment && !creator.commentDisabled);
    const disableDuet = !(opts?.allowDuet && !creator.duetDisabled);
    const disableStitch = !(opts?.allowStitch && !creator.stitchDisabled);

    // Commercial content disclosure → TikTok's brand toggles.
    const commercial = opts?.commercialDisclosure ?? false;
    const brandOrganicToggle = commercial && (opts?.brandOrganic ?? false);
    const brandedContentToggle = commercial && (opts?.brandedContent ?? false);

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
            disable_comment: disableComment,
            disable_duet: disableDuet,
            disable_stitch: disableStitch,
            brand_organic_toggle: brandOrganicToggle,
            brand_content_toggle: brandedContentToggle,
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
