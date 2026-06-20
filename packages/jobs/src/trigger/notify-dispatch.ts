import { schedules } from '@trigger.dev/sdk';
import { dispatchPending } from '@postpilot/notifications';

/** Every 2 minutes: deliver pending notifications across email/push/SMS. */
export const notifyDispatch = schedules.task({
  id: 'notify-dispatch',
  cron: '*/2 * * * *',
  run: async () => dispatchPending(),
});
