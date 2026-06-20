import { isAiConfigured } from '../config';
import { processPending } from '../batch';

/**
 * Worker entrypoint for the AI pipeline.
 *
 * Run it to drain PENDING videos (locally or on the Railway worker):
 *   npm run ai:process
 *
 * In the background-jobs chunk this same `processPending()` call is wrapped in a
 * durable Trigger.dev task (cron + on-demand) — the logic does not change.
 * Optionally limit the batch: AI_BATCH_LIMIT=10 npm run ai:process
 */
async function main() {
  if (!isAiConfigured()) {
    console.error('[ai] OPENAI_API_KEY is not set — nothing to do.');
    process.exit(1);
  }

  const limit = process.env.AI_BATCH_LIMIT ? Number(process.env.AI_BATCH_LIMIT) : undefined;
  const startedAt = Date.now();
  const results = await processPending({ limit });
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const dupes = ok.filter((r) => r.isDuplicate).length;

  console.log(
    `[ai] processed ${results.length} video(s): ${ok.length} ok (${dupes} flagged duplicate), ` +
      `${failed.length} failed in ${Date.now() - startedAt}ms`,
  );
  for (const f of failed) console.warn(`[ai] ${f.videoId}: ${f.error}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ai] fatal error', err);
    process.exit(1);
  });
