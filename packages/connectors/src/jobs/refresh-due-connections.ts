import { refreshDueConnections } from '../refresh-service';

/**
 * Cron entrypoint for proactive token refresh.
 *
 * Run on a schedule (e.g. hourly). For now it's a plain runnable script:
 *   npm --workspace=@postpilot/connectors run refresh:connections
 *
 * In the background-jobs chunk this same `refreshDueConnections()` function is
 * wrapped in a durable Trigger.dev cron task — the logic does not change.
 */
async function main() {
  const startedAt = Date.now();
  const results = await refreshDueConnections();
  const refreshed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(
    `[refresh] checked ${results.length} due connection(s): ${refreshed} refreshed, ${failed.length} failed in ${Date.now() - startedAt}ms`,
  );
  for (const f of failed) {
    console.warn(`[refresh] ${f.platform} ${f.id}: ${f.error}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[refresh] fatal error', err);
    process.exit(1);
  });
