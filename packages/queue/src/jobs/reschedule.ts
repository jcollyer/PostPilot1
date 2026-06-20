import { prisma } from '@postpilot/db';

import { recomputeSchedule } from '../scheduler';

/**
 * Cron entrypoint: recompute the schedule for every active queue so the
 * upcoming-posts plan rolls forward as time passes and slots are consumed.
 *
 *   npm run queue:reschedule
 *
 * Wrapped by a durable Trigger.dev cron later (alongside publishing) — same
 * `recomputeSchedule()` logic, unchanged.
 */
async function main() {
  const startedAt = Date.now();
  const queues = await prisma.queue.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  let items = 0;
  let tasks = 0;
  for (const q of queues) {
    const r = await recomputeSchedule(prisma, q.id);
    items += r.scheduledItems;
    tasks += r.tasks;
  }

  console.log(
    `[reschedule] ${queues.length} active queue(s): scheduled ${items} item(s), ` +
      `${tasks} publish task(s) in ${Date.now() - startedAt}ms`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[reschedule] fatal error', err);
    process.exit(1);
  });
