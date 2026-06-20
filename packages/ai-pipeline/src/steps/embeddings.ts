import { type PrismaClient } from '@saas/db';

import { EMBEDDING_MODEL, getOpenAI } from '../config';
import { writeEmbedding } from '../vectors';

/**
 * Compute and persist the video's content embedding. One embedding set powers
 * both near-duplicate detection and smart queue ordering (spacing similar
 * videos apart), so we embed the richest available text: title, caption,
 * hashtags, category, and transcript.
 */
export async function embedVideo(
  prisma: PrismaClient,
  params: {
    videoId: string;
    title: string;
    caption: string;
    hashtags: string[];
    category: string;
    transcript: string | null;
  },
): Promise<number[]> {
  const text = [
    params.title,
    params.category,
    params.hashtags.join(' '),
    params.caption,
    params.transcript ?? '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000)
    .trim();

  // Embeddings need non-empty input; fall back to a placeholder if somehow blank.
  const input = text.length > 0 ? text : 'short video';

  const res = await getOpenAI().embeddings.create({ model: EMBEDDING_MODEL, input });
  const embedding = res.data[0]?.embedding;
  if (!embedding) throw new Error('Embedding API returned no vector.');

  await writeEmbedding(prisma, params.videoId, embedding);
  return embedding;
}
