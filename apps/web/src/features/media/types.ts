import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';

export type RouterOutputs = inferRouterOutputs<AppRouter>;

/** A video as returned by `media.list` (and the shape the cards/dialogs use). */
export type VideoDto = RouterOutputs['media']['list']['items'][number];

/** A folder as returned by `folder.list` / `folder.children`. */
export type FolderDto = RouterOutputs['folder']['list']['folders'][number];

/** A breadcrumb node (root → current) from `folder.breadcrumbs`. */
export type BreadcrumbDto = RouterOutputs['folder']['breadcrumbs'][number];
