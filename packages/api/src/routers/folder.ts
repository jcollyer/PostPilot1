import { TRPCError } from '@trpc/server';
import { Prisma, type PrismaClient } from '@postpilot/db';
import {
  createFolderSchema,
  folderChildrenSchema,
  folderIdSchema,
  listFolderSchema,
  moveFolderSchema,
  renameFolderSchema,
} from '@postpilot/types';
import { deletePrefix, isStorageConfigured, videoPrefix } from '@postpilot/storage';

import { protectedProcedure, router } from '../trpc';
import { hasActiveTikTok, toVideoDto, VIDEO_INCLUDE } from './media';

/** Shape used by both the grid (folder cards) and the tree panel. */
const FOLDER_SELECT = {
  id: true,
  name: true,
  parentId: true,
  // Drives "open" affordance + item-count badges in the UI.
  _count: { select: { children: true, videos: true } },
} as const;
type FolderRow = Prisma.FolderGetPayload<{ select: typeof FOLDER_SELECT }>;

function toFolderDto(f: FolderRow) {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    childFolderCount: f._count.children,
    itemCount: f._count.videos,
  };
}

/** Load a folder the caller owns, or throw NOT_FOUND. */
async function ownedFolder(prisma: PrismaClient, userId: string, folderId: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
  if (!folder) throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found.' });
  return folder;
}

/** Assert a parent folder (null = root) exists and is owned by the caller. */
async function assertParentOwned(
  prisma: PrismaClient,
  userId: string,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  const parent = await prisma.folder.findFirst({
    where: { id: parentId, userId },
    select: { id: true },
  });
  if (!parent) throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent folder not found.' });
}

/**
 * Reject names that collide with an existing sibling. Postgres treats NULLs as
 * distinct, so the DB unique index doesn't cover root-level siblings — we check
 * here for every level so root behaves like the rest.
 */
async function assertNameAvailable(
  prisma: PrismaClient,
  userId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<void> {
  const clash = await prisma.folder.findFirst({
    where: {
      userId,
      parentId,
      name,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'A folder with that name already exists here.',
    });
  }
}

export const folderRouter = router({
  // -------------------------------------------------------------------------
  // Reads — the lazy, one-level-at-a-time loading the UI relies on
  // -------------------------------------------------------------------------

  /**
   * The contents of one level: all child folders, plus a cursor-paginated page
   * of that level's videos. `parentId === null` is the root. Folders are few, so
   * they're returned whole; videos page via `cursor`/`nextCursor`.
   */
  list: protectedProcedure.input(listFolderSchema).query(async ({ ctx, input }) => {
    const { parentId } = input;
    await assertParentOwned(ctx.prisma, ctx.userId, parentId);

    // Folders are returned only on the first page (no cursor) — they don't
    // paginate, so "load more" fetches only the next page of videos.
    const firstPage = !input.cursor;

    const [folders, videoRows, tiktokConnected] = await Promise.all([
      firstPage
        ? ctx.prisma.folder.findMany({
            where: { userId: ctx.userId, parentId },
            orderBy: { name: 'asc' },
            select: FOLDER_SELECT,
          })
        : Promise.resolve([] as FolderRow[]),
      ctx.prisma.video.findMany({
        where: { userId: ctx.userId, folderId: parentId },
        include: VIDEO_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      }),
      hasActiveTikTok(ctx.prisma, ctx.userId),
    ]);

    let nextCursor: string | undefined;
    if (videoRows.length > input.limit) nextCursor = videoRows.pop()!.id;

    return {
      folders: folders.map(toFolderDto),
      videos: { items: videoRows.map((r) => toVideoDto(r, tiktokConnected)), nextCursor },
    };
  }),

  /** Direct child folders of a node (no videos) — feeds the lazy tree panel. */
  children: protectedProcedure.input(folderChildrenSchema).query(async ({ ctx, input }) => {
    await assertParentOwned(ctx.prisma, ctx.userId, input.parentId);
    const folders = await ctx.prisma.folder.findMany({
      where: { userId: ctx.userId, parentId: input.parentId },
      orderBy: { name: 'asc' },
      select: FOLDER_SELECT,
    });
    return folders.map(toFolderDto);
  }),

  /** Root → current path for the breadcrumb bar. Returns [] for the root. */
  breadcrumbs: protectedProcedure.input(folderIdSchema).query(async ({ ctx, input }) => {
    const trail: { id: string; name: string }[] = [];
    let cursor: string | null = input.folderId;
    // Walk up parents. Bounded by a sane depth cap to guard against bad data.
    for (let i = 0; cursor && i < 100; i++) {
      const node: { id: string; name: string; parentId: string | null } | null =
        await ctx.prisma.folder.findFirst({
          where: { id: cursor, userId: ctx.userId },
          select: { id: true, name: true, parentId: true },
        });
      if (!node) break;
      trail.unshift({ id: node.id, name: node.name });
      cursor = node.parentId;
    }
    return trail;
  }),

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  /** Create a folder under `parentId` (null = root). */
  create: protectedProcedure.input(createFolderSchema).mutation(async ({ ctx, input }) => {
    await assertParentOwned(ctx.prisma, ctx.userId, input.parentId);
    await assertNameAvailable(ctx.prisma, ctx.userId, input.parentId, input.name);

    const folder = await ctx.prisma.folder.create({
      data: { userId: ctx.userId, name: input.name, parentId: input.parentId },
      select: FOLDER_SELECT,
    });
    return toFolderDto(folder);
  }),

  /** Rename a folder (must stay unique among its siblings). */
  rename: protectedProcedure.input(renameFolderSchema).mutation(async ({ ctx, input }) => {
    const folder = await ownedFolder(ctx.prisma, ctx.userId, input.folderId);
    await assertNameAvailable(ctx.prisma, ctx.userId, folder.parentId, input.name, folder.id);

    const updated = await ctx.prisma.folder.update({
      where: { id: folder.id },
      data: { name: input.name },
      select: FOLDER_SELECT,
    });
    return toFolderDto(updated);
  }),

  /**
   * Move a folder under a new parent (null = root). Rejects moving a folder into
   * itself or any of its own descendants (which would orphan a subtree).
   */
  move: protectedProcedure.input(moveFolderSchema).mutation(async ({ ctx, input }) => {
    const folder = await ownedFolder(ctx.prisma, ctx.userId, input.folderId);
    await assertParentOwned(ctx.prisma, ctx.userId, input.newParentId);

    if (input.newParentId === folder.id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "A folder can't contain itself." });
    }

    // Cycle guard: walk the new parent's ancestor chain; if we reach the folder
    // we're moving, the move would create a loop.
    let cursor: string | null = input.newParentId;
    for (let i = 0; cursor && i < 100; i++) {
      if (cursor === folder.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "You can't move a folder into one of its own subfolders.",
        });
      }
      const parent: { parentId: string | null } | null = await ctx.prisma.folder.findFirst({
        where: { id: cursor, userId: ctx.userId },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }

    await assertNameAvailable(ctx.prisma, ctx.userId, input.newParentId, folder.name, folder.id);

    const updated = await ctx.prisma.folder.update({
      where: { id: folder.id },
      data: { parentId: input.newParentId },
      select: FOLDER_SELECT,
    });
    return toFolderDto(updated);
  }),

  /**
   * Delete a folder and its ENTIRE subtree — descendant folders, every video
   * inside them, and the videos' storage objects. Child folder rows are removed
   * by the DB cascade; videos are deleted here so R2 prefixes get cleaned up.
   */
  remove: protectedProcedure.input(folderIdSchema).mutation(async ({ ctx, input }) => {
    await ownedFolder(ctx.prisma, ctx.userId, input.folderId);

    // 1. Collect the folder + all descendant folder ids via a recursive CTE.
    const subtree = await ctx.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE tree AS (
        SELECT "id" FROM "Folder" WHERE "id" = ${input.folderId} AND "userId" = ${ctx.userId}
        UNION ALL
        SELECT f."id" FROM "Folder" f JOIN tree t ON f."parentId" = t."id"
      )
      SELECT "id" FROM tree;
    `;
    const folderIds = subtree.map((r) => r.id);
    if (folderIds.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found.' });
    }

    // 2. Find every video in the subtree; delete its R2 prefix, then the rows.
    const videos = await ctx.prisma.video.findMany({
      where: { userId: ctx.userId, folderId: { in: folderIds } },
      select: { id: true, uploadSessionId: true },
    });

    if (isStorageConfigured()) {
      await Promise.all(
        videos.map((v) => deletePrefix(videoPrefix(ctx.userId, v.id)).catch(() => {})),
      );
    }

    // Keep upload-session counts in sync for any deleted videos.
    const sessionDecrements = new Map<string, number>();
    for (const v of videos) {
      if (v.uploadSessionId) {
        sessionDecrements.set(
          v.uploadSessionId,
          (sessionDecrements.get(v.uploadSessionId) ?? 0) + 1,
        );
      }
    }
    await Promise.all(
      [...sessionDecrements].map(([id, count]) =>
        ctx.prisma.uploadSession
          .update({ where: { id }, data: { videoCount: { decrement: count } } })
          .catch(() => {}),
      ),
    );

    await ctx.prisma.video.deleteMany({
      where: { id: { in: videos.map((v) => v.id) }, userId: ctx.userId },
    });

    // 3. Delete the subtree root; child folders cascade away.
    await ctx.prisma.folder.delete({ where: { id: input.folderId } });

    return { success: true as const, deletedVideos: videos.length };
  }),
});
