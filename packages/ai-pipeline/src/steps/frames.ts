import { type PrismaClient } from '@saas/db';
import { putObject, publicUrlForKey, thumbnailKey } from '@saas/storage';

import { extractFrame } from '../ffmpeg';
import type { MediaInfo } from '../ffmpeg';

export interface FrameCandidate {
  id: string;
  frameTimeSec: number;
  url: string;
  /** The JPEG bytes, kept in memory so the vision step can reuse them. */
  buffer: Buffer;
}

/** Even fractions through the video where we sample candidate thumbnails. */
const SAMPLE_FRACTIONS = [0.1, 0.3, 0.5, 0.7, 0.9];

/**
 * Extract candidate thumbnail frames, upload each to R2, and create
 * ThumbnailCandidate rows. Returns the candidates (with their JPEG buffers) so
 * the metadata step can show them to the vision model and pick the best one.
 *
 * Existing candidates for the video are cleared first so re-runs are idempotent.
 */
export async function extractThumbnails(
  prisma: PrismaClient,
  params: { userId: string; videoId: string; localPath: string; info: MediaInfo },
): Promise<FrameCandidate[]> {
  const { userId, videoId, localPath, info } = params;
  const duration = info.durationSec ?? 0;

  // For very short or unknown-duration clips, just grab a frame near the start.
  const times = duration > 1 ? SAMPLE_FRACTIONS.map((f) => +(duration * f).toFixed(2)) : [0];

  await prisma.thumbnailCandidate.deleteMany({ where: { videoId } });

  const candidates: FrameCandidate[] = [];
  for (const t of times) {
    let buffer: Buffer;
    try {
      buffer = await extractFrame(localPath, t);
    } catch {
      continue; // skip frames ffmpeg can't decode at that offset
    }
    if (buffer.length === 0) continue;

    // Create the row first so Prisma assigns the id we build the key from.
    const row = await prisma.thumbnailCandidate.create({
      data: { videoId, storageKey: '', frameTimeSec: t },
    });
    const key = thumbnailKey(userId, videoId, row.id);
    await putObject({ key, body: buffer, contentType: 'image/jpeg' });
    await prisma.thumbnailCandidate.update({
      where: { id: row.id },
      data: { storageKey: key, url: publicUrlForKey(key) },
    });

    candidates.push({ id: row.id, frameTimeSec: t, url: publicUrlForKey(key), buffer });
  }

  return candidates;
}
