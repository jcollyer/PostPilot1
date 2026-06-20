import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';

export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** A video as returned by `media.list` (and the shape the cards/dialogs use). */
export type VideoDto = RouterOutputs['media']['list']['items'][number];
