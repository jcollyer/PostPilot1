import { cosineSimilarity } from './embeddings';

export interface OrderableItem {
  id: string;
  videoId: string;
  categoryId: string | null;
}

/**
 * Recency weights for the lookback window (most-recent first). Penalizing the
 * immediately-previous item most strongly is what actually breaks up adjacency;
 * the 2-back term is a softer nudge that avoids ABAB becoming too rigid.
 */
const RECENCY_WEIGHTS = [1, 0.5];
const LOOKBACK = RECENCY_WEIGHTS.length;

/**
 * Similarity between two items in [0,1]-ish. Prefers embeddings; falls back to
 * category match when an embedding is missing so un-analyzed videos still get
 * spaced sensibly.
 */
function similarity(a: OrderableItem, b: OrderableItem, emb: Map<string, number[]>): number {
  const ea = emb.get(a.videoId);
  const eb = emb.get(b.videoId);
  if (ea && eb) return cosineSimilarity(ea, eb);
  if (a.categoryId && b.categoryId) return a.categoryId === b.categoryId ? 0.8 : 0.2;
  return 0.3;
}

/**
 * Reorder items to space similar content apart (drone, drone, drone → drone,
 * travel, city, drone). Greedy: keep the current first item as the anchor, then
 * repeatedly append whichever remaining item is *least* similar to the recent
 * window. Stable — ties keep the original relative order.
 *
 * Returns the reordered item ids.
 */
export function orderBySpacing(items: OrderableItem[], emb: Map<string, number[]>): string[] {
  if (items.length <= 2) return items.map((i) => i.id);

  const remaining = items.slice();
  const placed: OrderableItem[] = [remaining.shift()!];

  while (remaining.length > 0) {
    // Most-recent placed item first, to line up with RECENCY_WEIGHTS.
    const window = placed.slice(-LOOKBACK).reverse();
    let bestIdx = 0;
    let bestScore = Infinity; // lower recency-weighted similarity is better

    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      let score = 0;
      for (let w = 0; w < window.length; w++) {
        score += RECENCY_WEIGHTS[w]! * similarity(cand, window[w]!, emb);
      }
      // Strictly less keeps the earliest candidate on ties (stable).
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    placed.push(remaining.splice(bestIdx, 1)[0]!);
  }

  return placed.map((i) => i.id);
}
