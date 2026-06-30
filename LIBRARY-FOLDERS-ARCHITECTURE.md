# Library Folders — Architecture

Dropbox-style folder organization for the `/media` library. Goals:

- Create folders from the root.
- A folder contains media items (`Video`) and/or other folders (unlimited nesting).
- A media item lives in exactly one folder (or at the root).
- The page loads **one level at a time**: root contents on first load, then a folder's contents on demand when it's opened.

## 1. Data model (adjacency list)

We model the tree as an **adjacency list** — each row stores only its direct parent. This is the right fit because the access pattern is strictly "give me the direct children of one node." That's a single indexed query (`WHERE parentId = ?`), which is exactly what lazy, one-level-at-a-time loading needs. (A closure table / materialized path only earns its keep when you frequently need "all descendants" in one shot — we don't, except for delete, handled below with a recursive CTE.)

### New `Folder` model

```prisma
model Folder {
  id        String   @id @default(cuid())
  userId    String
  name      String
  parentId  String?  // null = root-level folder
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // Self-relation. Deleting a folder cascades to its child folders (the whole
  // subtree of folders). Videos are handled in app code so we can clean up R2.
  parent   Folder?  @relation("FolderTree", fields: [parentId], references: [id], onDelete: Cascade)
  children Folder[] @relation("FolderTree")
  videos   Video[]

  // No two sibling folders can share a name (Dropbox behavior). Note: in
  // Postgres, NULLs are distinct, so this does NOT constrain root-level names
  // across each other the way you'd want — enforce root-name uniqueness in app
  // code, or add a partial unique index via raw migration for parentId IS NULL.
  @@unique([userId, parentId, name])
  @@index([userId, parentId])
}
```

### `Video` gets a `folderId`

```prisma
model Video {
  // ...existing fields...
  folderId String?  // null = lives at the root
  folder   Folder?  @relation(fields: [folderId], references: [id], onDelete: SetNull)

  // ...existing relations...

  @@index([userId, folderId])   // add alongside the existing indexes
}
```

`onDelete: SetNull` on the video side is a safety net only — our app-level
delete (below) removes videos explicitly before the folder row goes away, so
this just guarantees no dangling FK if something is deleted out of band.

**Migration is zero-backfill:** every existing `Video` gets `folderId = NULL`, so the whole current library simply appears at the root. Same for `parentId` on folders.

### How this satisfies the requirements

- *Create folders from root* → `Folder` with `parentId = null`.
- *Folders contain folders and media* → `children` + `videos` relations.
- *A media item lives in one folder* → single `folderId` FK on `Video`.
- *Load level-by-level* → one query per `parentId`.

### Relationship to existing `Category` / `UploadSession`

Keep them — they're an **orthogonal** dimension. `Folder` is the user's physical filing location (one per video); `Category` is AI/tagging classification used for filtering and smart ordering; `UploadSession` is a batch label. They don't conflict. A video has at most one folder, at most one category, and optionally one upload session.

## 2. API (tRPC)

Add a new `folderRouter` (`packages/api/src/routers/folder.ts`) and register it in `packages/api/src/index.ts` as `folder`. Put the zod inputs in `packages/types/src/folder.ts` (mirroring `media.ts`), exported from the package index.

### The core lazy-load endpoint

```ts
// folder.list — the ONLY call the browser makes to open a level.
// parentId === null  → root contents
// parentId === "..." → that folder's direct contents
folderListSchema = z.object({
  parentId: z.string().min(1).nullable().default(null),
  cursor:   z.string().optional(),          // video pagination only
  limit:    z.number().int().min(1).max(100).default(50),
  search:   z.string().trim().optional(),   // optional: scoped search
});
```

Handler returns folders (always all of them — folders are few) plus a **paginated** slice of that level's videos (videos can be many):

```ts
list: protectedProcedure.input(folderListSchema).query(async ({ ctx, input }) => {
  const { parentId } = input;

  const [folders, videoRows] = await Promise.all([
    ctx.prisma.folder.findMany({
      where: { userId: ctx.userId, parentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, parentId: true, _count: { select: { children: true, videos: true } } },
    }),
    ctx.prisma.video.findMany({
      where: { userId: ctx.userId, folderId: parentId },   // null folderId = root
      include: VIDEO_INCLUDE,                                // reuse media router's include
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    }),
  ]);

  let nextCursor: string | undefined;
  if (videoRows.length > input.limit) nextCursor = videoRows.pop()!.id;

  const tiktokConnected = await hasActiveTikTok(ctx.prisma, ctx.userId);
  return {
    folders: folders.map((f) => ({
      id: f.id, name: f.name, parentId: f.parentId,
      childFolderCount: f._count.children,
      itemCount: f._count.videos,
    })),
    videos: { items: videoRows.map((r) => toVideoDto(r, tiktokConnected)), nextCursor },
  };
});
```

Reuse `VIDEO_INCLUDE`, `toVideoDto`, and `hasActiveTikTok` from `media.ts` (export them, or move the shared bits to a small helper module both routers import).

### Mutations

| Procedure | Input | Notes |
|---|---|---|
| `folder.create` | `{ name, parentId: string \| null }` | Validate parent ownership; enforce sibling-name uniqueness. |
| `folder.rename` | `{ folderId, name }` | Same uniqueness check among new siblings. |
| `folder.move` | `{ folderId, newParentId: string \| null }` | **Must reject cycles** (see below). |
| `folder.remove` | `{ folderId }` | Recursive delete incl. R2 cleanup (see below). |
| `media.moveMany` | `{ videoIds, folderId: string \| null }` | Add to `mediaRouter`, modeled on the existing `setCategoryMany`. This is how items move between folders / to root. |
| `folder.breadcrumbs` | `{ folderId }` | Returns `[{id,name}...]` root→current for the path bar. |

New uploads should set `folderId` to the folder the user is currently viewing — thread a `folderId` through `initUpload` (defaulting to `null` = root).

### Cycle prevention on `folder.move`

Moving folder A under B is illegal if B is A itself or any descendant of A. Walk B's ancestor chain up to the root; if you encounter A, reject with `BAD_REQUEST`. A Postgres recursive CTE does it in one query:

```sql
WITH RECURSIVE ancestors AS (
  SELECT id, "parentId" FROM "Folder" WHERE id = $newParentId
  UNION ALL
  SELECT f.id, f."parentId" FROM "Folder" f JOIN ancestors a ON f.id = a."parentId"
)
SELECT 1 FROM ancestors WHERE id = $folderId LIMIT 1;  -- any row => cycle, reject
```

### Recursive delete (with storage cleanup)

Deleting a folder should remove the entire subtree: all descendant folders, all their videos, and the corresponding R2 objects. Folder cascade handles child *folder* rows, but videos need explicit handling so `deletePrefix` runs:

```ts
remove: protectedProcedure.input(z.object({ folderId: z.string() })).mutation(async ({ ctx, input }) => {
  // 1. Collect the folder + all descendant folder ids via recursive CTE.
  const subtree = await ctx.prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT id FROM "Folder" WHERE id = ${input.folderId} AND "userId" = ${ctx.userId}
      UNION ALL
      SELECT f.id FROM "Folder" f JOIN tree t ON f."parentId" = t.id
    ) SELECT id FROM tree;`;
  const folderIds = subtree.map((r) => r.id);
  if (folderIds.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });

  // 2. Find every video in the subtree, delete its R2 prefix, then the rows.
  const videos = await ctx.prisma.video.findMany({
    where: { userId: ctx.userId, folderId: { in: folderIds } },
    select: { id: true },
  });
  if (isStorageConfigured()) {
    await Promise.all(videos.map((v) => deletePrefix(videoPrefix(ctx.userId, v.id)).catch(() => {})));
  }
  await ctx.prisma.video.deleteMany({ where: { id: { in: videos.map((v) => v.id) } } });

  // 3. Delete the root of the subtree; child folders cascade away.
  await ctx.prisma.folder.delete({ where: { id: input.folderId } });
  return { success: true as const };
});
```

> **Decision to confirm:** the above *deletes* a folder's videos. The alternative is to **move them to root** on folder delete (orphan-to-root). Dropbox deletes contents, so that's the default here — but it's a one-line change (`updateMany` `folderId: null` instead of `deleteMany` + R2 cleanup) if you'd rather keep the media.

## 3. Frontend (`MediaLibraryView.tsx`)

State and data flow:

- Track `currentFolderId: string | null` (start `null` = root) and a breadcrumb trail.
- On mount and whenever `currentFolderId` changes, call `trpc.folder.list.useQuery({ parentId: currentFolderId })`. React Query **caches per `parentId`**, so re-opening a previously visited folder is instant while still revalidating.
- **Double-click a folder** → `setCurrentFolderId(folder.id)`. The query key changes, the new level loads, nothing else is fetched. This is exactly the "only load contents after opening the parent" behavior you asked for.
- Render folders first (with `itemCount` / `childFolderCount` badges), then the video grid. "Load more" pages only the videos via `nextCursor`.
- Breadcrumb bar from `folder.breadcrumbs`; clicking a crumb sets `currentFolderId` to that ancestor.
- Uploads use `currentFolderId` as the target `folderId`.
- Optional polish: drag-a-video-onto-a-folder → `media.moveMany`; right-click menu for rename/move/delete.

One nuance worth deciding: **search**. Browsing is folder-scoped (`folderId = parentId`), but users usually expect search to span the whole library. Recommend: when `search` is non-empty, ignore `parentId` and query flat across all the user's videos (reuse the existing `media.list` search), and show a "search results" view instead of the folder view.

## 4. Build order

1. Schema: add `Folder`, add `folderId` to `Video`, `prisma migrate dev`.
2. `packages/types/src/folder.ts`: zod schemas + exports.
3. `packages/api/src/routers/folder.ts`: `list`, `create`, `rename`, `move`, `remove`, `breadcrumbs`; register in `index.ts`. Add `media.moveMany`; thread `folderId` into `initUpload`.
4. `MediaLibraryView.tsx`: folder grid, double-click navigation, breadcrumbs, scoped uploads.
5. Then layer on move/drag-drop and search-spanning.
