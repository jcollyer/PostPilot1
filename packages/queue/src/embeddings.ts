import { type PrismaClient, Prisma } from '@postpilot/db';

/**
 * Bulk-read video embeddings for smart ordering. The `embedding` column is
 * pgvector (`Unsupported` in Prisma), so we read it as text and parse — same
 * raw-SQL constraint as the AI pipeline, just the read side.
 */
export async function readEmbeddings(
  prisma: PrismaClient,
  videoIds: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (videoIds.length === 0) return out;

  const rows = await prisma.$queryRaw<Array<{ id: string; embedding: string | null }>>(Prisma.sql`
    SELECT "id", "embedding"::text AS "embedding"
    FROM "Video"
    WHERE "id" IN (${Prisma.join(videoIds)}) AND "embedding" IS NOT NULL
  `);

  for (const row of rows) {
    if (!row.embedding) continue;
    // pgvector text form is "[0.1,0.2,...]".
    const nums = row.embedding
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums.length > 0) out.set(row.id, nums);
  }
  return out;
}

/** Cosine similarity in [-1,1] (1 = identical direction). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
