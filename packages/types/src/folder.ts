import { z } from 'zod';

/**
 * Media Library folders. Folders form a tree via `parentId` (null = root). The
 * UI loads one level at a time, so `folder.list` takes a `parentId` and returns
 * that level's folders plus a cursor-paginated page of its videos.
 */

/** Folder display name. Trimmed; reused by create + rename. */
export const folderNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the folder a name')
  .max(120, 'That folder name is too long');

/**
 * List the direct contents of one level. `parentId === null` is the root.
 * `cursor`/`limit` paginate the videos only — folders are always returned whole.
 */
export const listFolderSchema = z.object({
  parentId: z.string().min(1).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.string().min(1).optional(),
});
export type ListFolderInput = z.infer<typeof listFolderSchema>;

/** Direct child folders of a node, for the lazy-expanding tree panel. */
export const folderChildrenSchema = z.object({
  parentId: z.string().min(1).nullable().default(null),
});
export type FolderChildrenInput = z.infer<typeof folderChildrenSchema>;

/** Create a folder under `parentId` (null = root). */
export const createFolderSchema = z.object({
  name: folderNameSchema,
  parentId: z.string().min(1).nullable().default(null),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

/** Rename a folder. */
export const renameFolderSchema = z.object({
  folderId: z.string().min(1),
  name: folderNameSchema,
});
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;

/** Move a folder to a new parent (null = root). Cycles are rejected server-side. */
export const moveFolderSchema = z.object({
  folderId: z.string().min(1),
  newParentId: z.string().min(1).nullable().default(null),
});
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;

/** A single folder id (delete, breadcrumbs). */
export const folderIdSchema = z.object({ folderId: z.string().min(1) });
export type FolderIdInput = z.infer<typeof folderIdSchema>;

/** Move many videos into a folder (or to the root when folderId is null). */
export const setFolderManySchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(1000),
  folderId: z.string().min(1).nullable(),
});
export type SetFolderManyInput = z.infer<typeof setFolderManySchema>;
