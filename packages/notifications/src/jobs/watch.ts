import { dispatchPending } from '../dispatcher';
import { runQueueHealthChecks } from '../queue-health';

/**
 * Dev convenience: loop that runs queue-health checks + delivers pending
 * notifications on an interval, so alerts flow without running the one-shots by
 * hand.
 *
 *   npm run notify:watch        (Ctrl+C to stop)
 *   NOTIFY_POLL_MS=30000 npm run notify:watch
 *
 * Stand-in for the Trigger.dev crons that run these in production.
 */
const POLL_MS = Number(process.env.NOTIFY_POLL_MS ?? 30_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[notify:watch] dispatching + health-checking every ${POLL_MS}ms — Ctrl+C to stop.`);
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\n[notify:watch] stopping…');
  });

  while (!stopping) {
    try {
      await runQueueHealthChecks();
      const r = await dispatchPending();
      if (r.processed > 0) {
        console.log(
          `[notify:watch] ${r.processed} processed: ${r.delivered} delivered, ${r.failed} failed, ${r.suppressed} suppressed`,
        );
      }
    } catch (err) {
      console.error('[notify:watch] error:', err);
    }
    if (!stopping) await sleep(POLL_MS);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[notify:watch] fatal error', err);
  process.exit(1);
});
