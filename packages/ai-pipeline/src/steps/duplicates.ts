import { DuplicateMethod, DuplicateType, type PrismaClient } from '@postpilot/db';

import { hammingDistanceHex, phashSimilarity } from '../phash';
import { findSimilarByEmbedding } from '../vectors';

/**
 * Duplicate detection over the user's existing library:
 *   - pHash (Hamming distance) catches exact copies, re-exports, and trims
 *     cheaply.
 *   - embedding cosine similarity catches "near-duplicate" content the pixels
 *     don't (different export of the same shoot, slightly different edit).
 *
 * Writes DuplicateMatch rows (idempotent) and flags the video with the single
 * best match so the queue can warn before publishing.
 */

// pHash Hamming-distance thresholds (0..64). Smaller = more similar.
const PHASH_EXACT = 0;
const PHASH_REEXPORT = 4;
const PHASH_TRIMMED = 10;
// Embedding cosine thresholds.
const EMBED_NEAR = 0.92;
const EMBED_FLAG = 0.95;

function classifyPhash(distance: number): DuplicateType | null {
  if (distance <= PHASH_EXACT) return DuplicateType.EXACT;
  if (distance <= PHASH_REEXPORT) return DuplicateType.REEXPORT;
  if (distance <= PHASH_TRIMMED) return DuplicateType.TRIMMED;
  return null;
}

export interface DuplicateOutcome {
  isDuplicate: boolean;
  duplicateOfId: string | null;
  matchCount: number;
}

export async function detectDuplicates(
  prisma: PrismaClient,
  params: { userId: string; videoId: string; pHash: string | null; embedding: number[] | null },
): Promise<DuplicateOutcome> {
  const { userId, videoId } = params;

  // Idempotent re-runs: clear this video's previous matches.
  await prisma.duplicateMatch.deleteMany({ where: { videoId } });

  type Candidate = {
    matchedVideoId: string;
    type: DuplicateType;
    method: DuplicateMethod;
    similarity: number;
  };
  const matches: Candidate[] = [];

  // --- pHash pass ---------------------------------------------------------
  if (params.pHash) {
    const others = await prisma.video.findMany({
      where: { userId, id: { not: videoId }, pHash: { not: null } },
      select: { id: true, pHash: true },
    });
    for (const other of others) {
      if (!other.pHash) continue;
      const distance = hammingDistanceHex(params.pHash, other.pHash);
      const type = classifyPhash(distance);
      if (type) {
        matches.push({
          matchedVideoId: other.id,
          type,
          method: DuplicateMethod.PHASH,
          similarity: phashSimilarity(params.pHash, other.pHash),
        });
      }
    }
  }

  // --- embedding pass -----------------------------------------------------
  if (params.embedding) {
    const similar = await findSimilarByEmbedding(prisma, {
      userId,
      excludeVideoId: videoId,
      embedding: params.embedding,
      limit: 5,
      minSimilarity: EMBED_NEAR,
    });
    for (const s of similar) {
      matches.push({
        matchedVideoId: s.id,
        type: DuplicateType.NEAR,
        method: DuplicateMethod.EMBEDDING,
        similarity: s.similarity,
      });
    }
  }

  // Persist (unique on videoId+matchedVideoId+method).
  for (const m of matches) {
    await prisma.duplicateMatch.upsert({
      where: {
        videoId_matchedVideoId_method: {
          videoId,
          matchedVideoId: m.matchedVideoId,
          method: m.method,
        },
      },
      create: {
        videoId,
        matchedVideoId: m.matchedVideoId,
        type: m.type,
        method: m.method,
        similarity: m.similarity,
      },
      update: { type: m.type, similarity: m.similarity },
    });
  }

  // Flag the video with its strongest match (exact pHash wins, else best score).
  const best = matches.slice().sort((a, b) => rank(b) - rank(a))[0];
  const flag =
    best && (best.method === DuplicateMethod.PHASH || best.similarity >= EMBED_FLAG) ? best : null;

  await prisma.video.update({
    where: { id: videoId },
    data: { isDuplicate: Boolean(flag), duplicateOfId: flag?.matchedVideoId ?? null },
  });

  return {
    isDuplicate: Boolean(flag),
    duplicateOfId: flag?.matchedVideoId ?? null,
    matchCount: matches.length,
  };
}

/** Rank for choosing the "primary" duplicate: pHash certainty then similarity. */
function rank(m: { method: DuplicateMethod; type: DuplicateType; similarity: number }): number {
  const methodWeight = m.method === DuplicateMethod.PHASH ? 1 : 0;
  const exactWeight = m.type === DuplicateType.EXACT ? 1 : 0;
  return methodWeight * 2 + exactWeight + m.similarity;
}
