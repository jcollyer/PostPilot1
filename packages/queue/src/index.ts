// Scheduling
export {
  ensureQueue,
  recomputeSchedule,
  rescheduleAllActiveQueues,
  getUpcoming,
  type UpcomingPost,
} from './scheduler';
export { generateSlots, type Slot, type ScheduleRule } from './slots';

// Smart ordering
export { smartArrangeQueue } from './service';
export { orderBySpacing, type OrderableItem } from './ordering';
export { readEmbeddings, cosineSimilarity } from './embeddings';

// Float-position helpers
export { appendPosition, positionBetween, normalizedPositions } from './positions';

// Config
export { HORIZON_DAYS, MAX_SLOTS, POSITION_STEP } from './config';
