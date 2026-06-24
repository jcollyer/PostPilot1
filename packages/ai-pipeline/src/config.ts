import OpenAI from 'openai';

/**
 * AI pipeline configuration. One provider (OpenAI) does transcription, the
 * vision LLM, and embeddings. Model names are overridable via env so they can
 * be bumped without code changes.
 *
 * Required env:
 *   OPENAI_API_KEY
 * Optional env (defaults shown):
 *   OPENAI_VISION_MODEL      gpt-4o
 *   OPENAI_TRANSCRIBE_MODEL  whisper-1
 *   OPENAI_EMBEDDING_MODEL   text-embedding-3-small
 */

export const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? 'gpt-4o';
export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1';
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';

/** Embedding dimension — must match the pgvector column (vector(1536)). */
export const EMBEDDING_DIMENSIONS = 1536;

/** True when the pipeline has what it needs to run. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;

/** Lazily-constructed, reused OpenAI client. */
export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('AI pipeline is not configured: missing OPENAI_API_KEY.');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // Be patient with Whisper uploads + vision calls, and let the SDK retry
      // transient network blips a few times before giving up.
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 120_000),
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? 3),
    });
  }
  return client;
}

/** Compact, log-friendly description of an OpenAI/SDK error. */
export function describeOpenAIError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as {
      name?: string;
      status?: number;
      code?: string;
      message?: string;
      cause?: unknown;
    };
    const parts = [e.name, e.status ? `HTTP ${e.status}` : '', e.code, e.message].filter(Boolean);
    const cause = e.cause
      ? ` (cause: ${String((e.cause as { message?: string })?.message ?? e.cause)})`
      : '';
    return parts.join(' ') + cause;
  }
  return String(err);
}
