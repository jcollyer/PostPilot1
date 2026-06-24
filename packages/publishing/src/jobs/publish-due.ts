import { publishDueTasks } from '../runner';

/**
 * Worker entrypoint: publish everything that's due (and poll in-flight posts).
 *
 *   npm run publish:due
 *
 * Wrapped by a durable Trigger.dev cron later (alongside refresh:connections +
 * queue:reschedule) — the `publishDueTasks()` logic does not change.
 *   PUBLISH_BATCH_LIMIT=10 npm run publish:due
 */
async function main() {
  const startedAt = Date.now();
  const limit = process.env.PUBLISH_BATCH_LIMIT
    ? Number(process.env.PUBLISH_BATCH_LIMIT)
    : undefined;
  const results = await publishDueTasks({ limit });

  const by = (o: string) => results.filter((r) => r.outcome === o).length;
  console.log(
    `[publish] ${results.length} task(s): ${by('published')} published, ${by('processing')} processing, ` +
      `${by('retry')} retry, ${by('failed')} failed, ${by('held')} held in ${Date.now() - startedAt}ms`,
  );
  for (const r of results.filter((x) => x.outcome === 'failed' || x.outcome === 'held')) {
    console.warn(`[publish] ${r.platform} ${r.taskId}: ${r.outcome} — ${r.detail ?? ''}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[publish] fatal error', err);
    process.exit(1);
  });
