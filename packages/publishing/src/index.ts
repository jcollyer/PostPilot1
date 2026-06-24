// Runner (the engine the worker drives)
export { publishDueTasks, processTask, type PublishRunResult } from './runner';

// Adapters (Publish(Video) per platform)
export { getPublishAdapter, fetchTikTokCreatorInfo, type TikTokCreatorInfo } from './adapters';
export type {
  PublishAdapter,
  PublishInput,
  PublishResult,
  PollResult,
  TikTokPublishOptions,
} from './types';

// Errors + config
export { PublishError } from './http';
export {
  TIKTOK_DEFAULT_PRIVACY,
  YOUTUBE_DEFAULT_PRIVACY,
  MAX_PUBLISH_ATTEMPTS,
  POLL_INTERVAL_MS,
} from './config';
