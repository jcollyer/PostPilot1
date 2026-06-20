import { dispatchPending } from '../dispatcher';

/**
 * Worker entrypoint: deliver pending notifications across their channels.
 *
 *   npm run notify:dispatch
 *
 * Wrapped by a Trigger.dev cron later — `dispatchPending()` is unchanged.
 */
async function main() {
  const startedAt = Date.now();
  const r = await dispatchPending();
  console.log(
    `[notify] processed ${r.processed}: ${r.delivered} delivered, ${r.failed} failed, ` +
      `${r.suppressed} suppressed in ${Date.now() - startedAt}ms`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[notify] fatal error', err);
    process.exit(1);
  });
