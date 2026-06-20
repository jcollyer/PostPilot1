import { isAiConfigured } from '../config';
import { processPending } from '../batch';

/**
 * Dev convenience: long-running loop that drains PENDING videos every few
 * seconds, so clicking "Generate metadata" in the app just works without
 * re-running the one-shot worker by hand.
 *
 *   npm run ai:watch        (Ctrl+C to stop)
 *   AI_POLL_MS=10000 npm run ai:watch   (custom interval)
 *
 * This is a stand-in for the Trigger.dev cron/on-upload trigger that will run
 * `processPending()` in production — same logic, just polled locally.
 */
const POLL_MS = Number(process.env.AI_POLL_MS ?? 5000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!isAiConfigured()) {
    console.error('[ai:watch] OPENAI_API_KEY is not set — nothing to do.');
    process.exit(1);
  }

  console.log(`[ai:watch] watching for PENDING videos every ${POLL_MS}ms — Ctrl+C to stop.`);
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\n[ai:watch] stopping…');
  });

  while (!stopping) {
    try {
      const results = await processPending();
      if (results.length > 0) {
        const ok = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => !r.ok);
        console.log(`[ai:watch] processed ${results.length}: ${ok} ok, ${failed.length} failed`);
        for (const f of failed) console.warn(`[ai:watch] ${f.videoId}: ${f.error}`);
      }
    } catch (err) {
      console.error('[ai:watch] batch error:', err);
    }
    if (!stopping) await sleep(POLL_MS);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[ai:watch] fatal error', err);
  process.exit(1);
});
