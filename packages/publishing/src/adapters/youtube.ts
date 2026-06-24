import { Platform } from '@postpilot/db';

import { YOUTUBE_DEFAULT_PRIVACY, YOUTUBE_UPLOAD_BASE } from '../config';
import { PublishError, rawFetch } from '../http';
import { type PublishAdapter, type PublishInput } from '../types';

/**
 * YouTube Data API v3 resumable upload. Unlike TikTok/IG (which pull from a
 * URL), YouTube needs the bytes, so we stream the file from R2 and PUT it. A
 * "Short" is just a qualifying vertical video; we hint it via #Shorts.
 * Unverified projects are forced to privacyStatus=private.
 */

function classify(context: string, status: number, body: string): PublishError {
  const msg = `${context}: HTTP ${status} ${body.slice(0, 300)}`;
  if (status === 401)
    return new PublishError(msg, { needsReconnect: true, status, platform: Platform.YOUTUBE });
  if (status === 403) {
    const quota = /quotaExceeded|rateLimitExceeded|userRateLimitExceeded/i.test(body);
    return new PublishError(
      msg,
      quota
        ? { recoverable: true, status, platform: Platform.YOUTUBE }
        : { needsReconnect: true, status, platform: Platform.YOUTUBE },
    );
  }
  if (status === 408 || status === 429 || status >= 500) {
    return new PublishError(msg, { recoverable: true, status, platform: Platform.YOUTUBE });
  }
  return new PublishError(msg, { rejected: true, status, platform: Platform.YOUTUBE });
}

export const youtubePublishAdapter: PublishAdapter = {
  platform: Platform.YOUTUBE,

  async publish(input: PublishInput) {
    const title = (input.title || input.caption || 'Untitled').slice(0, 100);
    const description = [input.caption, input.hashtags.map((t) => `#${t}`).join(' '), '#Shorts']
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 5000);
    const metadata = {
      snippet: { title, description, tags: input.hashtags.slice(0, 30), categoryId: '22' },
      status: { privacyStatus: YOUTUBE_DEFAULT_PRIVACY, selfDeclaredMadeForKids: false },
    };

    // 1. Initiate the resumable session; the upload URL comes back in Location.
    const initRes = await rawFetch(
      `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        context: 'youtube upload init',
        platform: Platform.YOUTUBE,
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': input.mimeType ?? 'video/mp4',
          ...(input.fileSize ? { 'X-Upload-Content-Length': String(input.fileSize) } : {}),
        },
        body: JSON.stringify(metadata),
      },
    );
    if (!initRes.ok) throw classify('youtube upload init', initRes.status, await initRes.text());
    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      throw new PublishError('youtube upload init: no resumable URL', {
        recoverable: true,
        platform: Platform.YOUTUBE,
      });
    }

    // 2. Upload the bytes.
    const bytes = await input.getBytes();
    const uploadRes = await rawFetch(uploadUrl, {
      method: 'PUT',
      context: 'youtube upload',
      platform: Platform.YOUTUBE,
      headers: {
        'Content-Type': input.mimeType ?? 'video/mp4',
        'Content-Length': String(bytes.length),
      },
      body: bytes,
    });
    const text = await uploadRes.text();
    if (!uploadRes.ok) throw classify('youtube upload', uploadRes.status, text);

    const video = (text ? JSON.parse(text) : {}) as { id?: string };
    if (!video.id) {
      throw new PublishError('youtube upload: no video id returned', {
        recoverable: true,
        platform: Platform.YOUTUBE,
      });
    }
    return {
      state: 'PUBLISHED' as const,
      platformPostId: video.id,
      platformPostUrl: `https://www.youtube.com/shorts/${video.id}`,
    };
  },
};
