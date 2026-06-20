import { runQueueHealthChecks } from '../queue-health';

/**
 * Worker entrypoint: scan active queues and emit running-low / empty alerts.
 *
 *   npm run notify:queue-health
 *
 * Run on a schedule (e.g. daily). Pairs with notify:dispatch which delivers the
 * alerts it produces. Wrapped by a Trigger.dev cron later.
 */
async function main() {
  const r = await runQueueHealthChecks();
  console.log(`[queue-health] checked ${r.checked} queue(s), raised ${r.alerts} alert(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[queue-health] fatal error', err);
    process.exit(1);
  });
