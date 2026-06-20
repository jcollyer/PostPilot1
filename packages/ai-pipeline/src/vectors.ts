import { type PrismaClient, Prisma } from '@postpilot/db';

import { EMBEDDING_DIMENSIONS } from './config';

/**
 * pgvector access. The `Video.embedding` column is `Unsupported("vector(1536)")`
 * in Prisma, so it can only be read/written with raw SQL — never the typed
 * client. These helpers centralize that.
 */

/** Format a number[] as a pgvector literal: "[0.1,0.2,...]". */
export function toVectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding must be ${EMBEDDING_DIMENSIONS}-dim, got ${values.length}.`);
  }
  return `[${values.join(',')}]`;
}

/** Persist an embedding for a video. */
export async function writeEmbedding(
  prisma: PrismaClient,
  videoId: string,
  embedding: number[],
): Promise<void> {
  const literal = toVectorLiteral(embedding);
  await prisma.$executeRaw`UPDATE "Video" SET "embedding" = ${literal}::vector WHERE "id" = ${videoId}`;
}

export interface SimilarVideo {
  id: string;
  similarity: number;
}

/**
 * Cosine-nearest neighbours to `embedding` among the user's other videos that
 * already have an embedding. Returns similarity in [0,1] (1 = identical).
 * Powers both near-duplicate detection and smart queue ordering.
 */
export async function findSimilarByEmbedding(
  prisma: PrismaClient,
  params: {
    userId: string;
    excludeVideoId: string;
    embedding: number[];
    limit?: number;
    minSimilarity?: number;
  },
): Promise<SimilarVideo[]> {
  const literal = toVectorLiteral(params.embedding);
  const limit = params.limit ?? 10;
  const minSimilarity = params.minSimilarity ?? 0;

  const rows = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>(Prisma.sql`
    SELECT "id", 1 - ("embedding" <=> ${literal}::vector) AS "similarity"
    FROM "Video"
    WHERE "userId" = ${params.userId}
      AND "id" <> ${params.excludeVideoId}
      AND "embedding" IS NOT NULL
      AND 1 - ("embedding" <=> ${literal}::vector) >= ${minSimilarity}
    ORDER BY "embedding" <=> ${literal}::vector
    LIMIT ${limit}
  `);

  return rows.map((r) => ({ id: r.id, similarity: Number(r.similarity) }));
}
