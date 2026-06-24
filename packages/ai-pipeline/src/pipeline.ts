import { join } from 'node:path';

import { prisma } from '@postpilot/db';
import { downloadToFile } from '@postpilot/storage';

import { describeOpenAIError, isAiConfigured } from './config';
import { extractGray9x8, probeMedia } from './ffmpeg';
import { dHashFromGray9x8 } from './phash';
import { extractThumbnails } from './steps/frames';
import { transcribeVideo } from './steps/transcribe';
import { generateMetadata } from './steps/metadata';
import { embedVideo } from './steps/embeddings';
import { detectDuplicates } from './steps/duplicates';
import { persistMetadata } from './steps/persist';
import { withTempDir } from './workdir';

export interface ProcessResult {
  videoId: string;
  ok: boolean;
  error?: string;
  isDuplicate?: boolean;
}

/**
 * Run the full AI pipeline for one video. Ordered steps, each isolated so a
 * later failure doesn't lose earlier work:
 *   probe → frames → transcribe → metadata (vision) → persist →
 *   embeddings → pHash → duplicate detection.
 *
 * Sets aiStatus RUNNING up front and COMPLETED/FAILED at the end. Designed to
 * be wrapped by a durable Trigger.dev task later without changing this logic.
 */
export async function processVideo(videoId: string): Promise<ProcessResult> {
  if (!isAiConfigured()) {
    return { videoId, ok: false, error: 'OPENAI_API_KEY is not set' };
  }

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) return { videoId, ok: false, error: 'video not found' };
  if (!video.storageKey) return { videoId, ok: false, error: 'video has no storage key' };

  await prisma.video.update({
    where: { id: videoId },
    data: { aiStatus: 'RUNNING' },
  });

  try {
    const result = await withTempDir(async (dir) => {
      const localPath = join(dir, 'source');
      await downloadToFile(video.storageKey, localPath);

      // 1. Probe + backfill media properties we don't already have.
      const info = await probeMedia(localPath);
      await prisma.video.update({
        where: { id: videoId },
        data: {
          durationSec: video.durationSec ?? info.durationSec,
          width: video.width ?? info.width,
          height: video.height ?? info.height,
          status: video.status === 'UPLOADING' ? 'READY' : video.status,
        },
      });

      // 2. Candidate thumbnails (kept in memory for the vision step).
      const frames = await extractThumbnails(prisma, {
        userId: video.userId,
        videoId,
        localPath,
        info,
      });

      // 3. Transcription (null when there's no audio). Non-fatal: a Whisper
      //    failure shouldn't sink the whole video — we fall back to frames-only.
      let transcript: string | null = null;
      try {
        transcript = await transcribeVideo({ localPath, info, tmpDir: dir });
        if (transcript) {
          await prisma.video.update({ where: { id: videoId }, data: { transcript } });
        }
      } catch (err) {
        console.warn(
          `[ai] transcription failed for ${videoId} (continuing): ${describeOpenAIError(err)}`,
        );
      }

      // 4. Vision metadata + 5. persist (base, per-platform, category, thumb).
      let metadata;
      try {
        metadata = await generateMetadata({
          frames: frames.map((f) => f.buffer),
          transcript,
          durationSec: info.durationSec,
        });
      } catch (err) {
        throw new Error(`vision metadata (OpenAI) failed: ${describeOpenAIError(err)}`);
      }
      const selectedThumbnailId = frames[metadata.bestFrameIndex]?.id ?? frames[0]?.id ?? null;
      await persistMetadata(prisma, {
        userId: video.userId,
        videoId,
        metadata,
        selectedThumbnailId,
      });

      // 6. Embedding (powers dedupe + smart ordering).
      let embedding: number[] | null = null;
      try {
        embedding = await embedVideo(prisma, {
          videoId,
          title: metadata.title,
          caption: metadata.caption,
          hashtags: metadata.hashtags,
          category: metadata.category,
          transcript,
        });
      } catch (err) {
        console.warn(`[ai] embedding failed for ${videoId}: ${describeOpenAIError(err)}`);
      }

      // 7. pHash from the middle frame.
      let pHash: string | null = null;
      try {
        const mid = info.durationSec ? info.durationSec / 2 : 0;
        const gray = await extractGray9x8(localPath, mid);
        pHash = dHashFromGray9x8(gray);
        await prisma.video.update({ where: { id: videoId }, data: { pHash } });
      } catch (err) {
        console.warn(`[ai] pHash failed for ${videoId}:`, err);
      }

      // 8. Duplicate detection across the user's library.
      const dupes = await detectDuplicates(prisma, {
        userId: video.userId,
        videoId,
        pHash,
        embedding,
      });

      return { isDuplicate: dupes.isDuplicate };
    });

    await prisma.video.update({
      where: { id: videoId },
      data: { aiStatus: 'COMPLETED', aiProcessedAt: new Date() },
    });
    return { videoId, ok: true, isDuplicate: result.isDuplicate };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.video
      .update({ where: { id: videoId }, data: { aiStatus: 'FAILED' } })
      .catch(() => {});
    return { videoId, ok: false, error: message };
  }
}
