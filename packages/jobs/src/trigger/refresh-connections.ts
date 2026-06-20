import { schedules } from '@trigger.dev/sdk';
import { refreshDueConnections } from '@postpilot/connectors';

/** Hourly: proactively refresh OAuth tokens before they expire. */
export const refreshConnections = schedules.task({
  id: 'refresh-connections',
  cron: '0 * * * *',
  run: async () => {
    const results = await refreshDueConnections();
    return { checked: results.length, failed: results.filter((r) => !r.ok).length };
  },
});
