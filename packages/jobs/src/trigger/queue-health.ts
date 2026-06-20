import { schedules } from '@trigger.dev/sdk';
import { runQueueHealthChecks } from '@postpilot/notifications';

/** Daily: raise "running low" / "empty" alerts for active queues. */
export const queueHealth = schedules.task({
  id: 'queue-health',
  cron: '0 12 * * *',
  run: async () => runQueueHealthChecks(),
});
