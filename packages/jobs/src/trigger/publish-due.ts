import { schedules } from '@trigger.dev/sdk';
import { publishDueTasks } from '@postpilot/publishing';

/** Every minute: publish posts that are due and poll in-flight ones. */
export const publishDue = schedules.task({
  id: 'publish-due',
  cron: '* * * * *',
  run: async () => {
    const results = await publishDueTasks();
    const by = (o: string) => results.filter((r) => r.outcome === o).length;
    return { total: results.length, published: by('published'), failed: by('failed') };
  },
});
