// Config
export {
  isAiConfigured,
  getOpenAI,
  VISION_MODEL,
  TRANSCRIBE_MODEL,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from './config';

// Orchestration
export { processVideo, type ProcessResult } from './pipeline';
export { processPending, processUploadSession } from './batch';

// pgvector helpers (reused by the queue's smart ordering in Chunk 6)
export {
  toVectorLiteral,
  writeEmbedding,
  findSimilarByEmbedding,
  type SimilarVideo,
} from './vectors';

// Perceptual hash helpers
export { dHashFromGray9x8, hammingDistanceHex, phashSimilarity } from './phash';
