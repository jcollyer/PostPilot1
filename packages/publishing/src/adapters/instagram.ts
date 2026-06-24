import { Platform } from '@postpilot/db';

import { IG_GRAPH_BASE, IG_GRAPH_VERSION } from '../config';
import { PublishError, rawFetch } from '../http';
import {
  captionWithHashtags,
  type PollInput,
  type PublishAdapter,
  type PublishInput,
} from '../types';

/**
 * Instagram Reels via the Graph API (API with Instagram Login). Flow:
 *   1. create a REELS media container from the public video_url
 *   2. poll the container's status_code until FINISHED
 *   3. media_publish the creation_id
 * `externalAccountId` is the IG user id. Reels are capped at 90s; the file must
 * be a public H.264 MP4/MOV.
 */

function base(path: string): string {
  return `${IG_GRAPH_BASE}/${IG_GRAPH_VERSION}/${path}`;
}

interface IgError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

/** POST/GET against the IG Graph, classifying errors the way the runner expects. */
async function igRequest<T>(url: string, method: 'GET' | 'POST'): Promise<T> {
  const res = await rawFetch(url, { method, context: 'instagram', platform: Platform.INSTAGRAM });
  const text = await res.text();
  let json: (T & IgError) | undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const code = json?.error?.code;
    const msg = `instagram: HTTP ${res.status} ${json?.error?.message ?? text.slice(0, 300)}`;
    // 190/102/10/200/467 = auth/permission; 4/17/32/613 = rate limit.
    if (code && [190, 102, 10, 200, 467].includes(code)) {
      throw new PublishError(msg, {
        needsReconnect: true,
        status: res.status,
        platform: Platform.INSTAGRAM,
      });
    }
    if (code && [4, 17, 32, 613].includes(code)) {
      throw new PublishError(msg, {
        recoverable: true,
        status: res.status,
        platform: Platform.INSTAGRAM,
      });
    }
    if (res.status === 429 || res.status >= 500) {
      throw new PublishError(msg, {
        recoverable: true,
        status: res.status,
        platform: Platform.INSTAGRAM,
      });
    }
    throw new PublishError(msg, {
      rejected: true,
      status: res.status,
      platform: Platform.INSTAGRAM,
    });
  }
  return (json ?? {}) as T;
}

export const instagramPublishAdapter: PublishAdapter = {
  platform: Platform.INSTAGRAM,

  async publish(input: PublishInput) {
    const caption = captionWithHashtags(input.caption || input.title, input.hashtags).slice(
      0,
      2200,
    );
    const params = new URLSearchParams({
      media_type: 'REELS',
      video_url: input.videoUrl,
      caption,
      access_token: input.accessToken,
    });
    const created = await igRequest<{ id?: string }>(
      `${base(`${input.externalAccountId}/media`)}?${params.toString()}`,
      'POST',
    );
    if (!created.id) {
      throw new PublishError('instagram: media container had no id', {
        rejected: true,
        platform: Platform.INSTAGRAM,
      });
    }
    return { state: 'PROCESSING' as const, externalContainerId: created.id };
  },

  async poll({ accessToken, externalAccountId, containerId }: PollInput) {
    // 1. Where is the container in processing?
    const status = await igRequest<{ status_code?: string }>(
      `${base(containerId)}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
      'GET',
    );
    const code = status.status_code;
    if (code === 'IN_PROGRESS') return { state: 'PROCESSING' as const };
    if (code === 'ERROR' || code === 'EXPIRED') {
      return { state: 'FAILED' as const, error: `Instagram container ${code}` };
    }
    if (code !== 'FINISHED' && code !== 'PUBLISHED') {
      return { state: 'PROCESSING' as const };
    }

    // 2. Container is ready — publish it.
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });
    const published = await igRequest<{ id?: string }>(
      `${base(`${externalAccountId}/media_publish`)}?${publishParams.toString()}`,
      'POST',
    );
    const mediaId = published.id ?? null;

    // 3. Best-effort permalink for the UI (don't fail the publish if this errors).
    let url: string | null = null;
    if (mediaId) {
      try {
        const perma = await igRequest<{ permalink?: string }>(
          `${base(mediaId)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
          'GET',
        );
        url = perma.permalink ?? null;
      } catch {
        url = null;
      }
    }
    return { state: 'PUBLISHED' as const, platformPostId: mediaId, platformPostUrl: url };
  },
};
