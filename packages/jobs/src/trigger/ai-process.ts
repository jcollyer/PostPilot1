import { schedules } from '@trigger.dev/sdk';
import { processPending } from '@postpilot/ai-pipeline';

/**
 * Every 5 minutes: drain PENDING videos through the AI pipeline (transcribe,
 * metadata, embeddings, pHash, dedupe). ffmpeg is provided by the ffmpeg build
 * extension. For instant processing you can also trigger this from the upload
 * flow instead of waiting for the cron.
 */
export const aiProcess = schedules.task({
  id: 'ai-process',
  cron: '*/5 * * * *',
  run: async () => {
    const results = await processPending();
    return { processed: results.length, failed: results.filter((r) => !r.ok).length };
  },
});
