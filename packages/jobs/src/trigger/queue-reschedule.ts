import { schedules } from '@trigger.dev/sdk';
import { prisma } from '@postpilot/db';
import { rescheduleAllActiveQueues } from '@postpilot/queue';

/** Hourly: roll the publish plan forward for every active queue. */
export const queueReschedule = schedules.task({
  id: 'queue-reschedule',
  cron: '0 * * * *',
  run: async () => rescheduleAllActiveQueues(prisma),
});
