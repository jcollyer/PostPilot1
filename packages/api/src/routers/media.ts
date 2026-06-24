import { TRPCError } from '@trpc/server';
import { Platform, Prisma, type PrismaClient } from '@postpilot/db';
import {
  abortUploadSchema,
  aiSummarySchema,
  completeUploadSchema,
  confirmCoverUploadSchema,
  createUploadSessionSchema,
  DEFAULT_TIKTOK_OPTIONS,
  evaluateTikTokRequirements,
  initCoverUploadSchema,
  initUploadSchema,
  listVideosSchema,
  regenerateMetadataSchema,
  selectThumbnailSchema,
  setCategoryManySchema,
  setPlatformMetaSchema,
  setTiktokMetaSchema,
  type TikTokPostOptions,
  type TikTokPrivacyLevel,
  updateVideoMetadataSchema,
  videoIdSchema,
  videoIdsSchema,
} from '@postpilot/types';
import {
  abortMultipart,
  completeMultipart,
  coverKey,
  createMultipartUpload,
  deletePrefix,
  extensionFor,
  extensionForMime,
  isStorageConfigured,
  planMultipart,
  presignPut,
  presignUploadParts,
  publicUrlForKey,
  sourceKey,
  videoPrefix,
} from '@postpilot/storage';

import { protectedProcedure, router } from '../trpc';

/** Guard storage-backed procedures with a clear error when R2 isn't set up. */
function assertStorageConfigured() {
  if (!isStorageConfigured()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Media storage is not configured yet. Add the R2_* environment variables.',
    });
  }
}

/** Load a video the caller owns, or throw NOT_FOUND. */
async function ownedVideo(prisma: PrismaClient, userId: string, videoId: string) {
  const video = await prisma.video.findFirst({ where: { id: videoId, userId } });
  if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
  return video;
}

const VIDEO_INCLUDE = {
  category: true,
  selectedThumbnail: true,
  // Only the TikTok row is needed to compute the "requires user input" gate.
  platformMeta: { where: { platform: Platform.TIKTOK } },
  // Used to flag whether the video is already part of the user's queue.
  _count: { select: { queueItems: true } },
} as const;
type VideoRecord = Prisma.VideoGetPayload<{ include: typeof VIDEO_INCLUDE }>;

type PlatformMetaRecord = Prisma.VideoPlatformMetaGetPayload<true>;

/** Whether the caller has a usable (ACTIVE) TikTok connection right now. */
async function hasActiveTikTok(prisma: PrismaClient, userId: string): Promise<boolean> {
  const conn = await prisma.platformConnection.findFirst({
    where: { userId, platform: Platform.TIKTOK, status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(conn);
}

/** Map a stored TikTok platform-meta row (or none) to the shared options shape. */
function tiktokOptionsFromMeta(meta: PlatformMetaRecord | undefined): TikTokPostOptions {
  if (!meta) return { ...DEFAULT_TIKTOK_OPTIONS };
  return {
    privacy: (meta.tiktokPrivacy as TikTokPrivacyLevel | null) ?? null,
    allowComment: meta.tiktokAllowComment,
    allowDuet: meta.tiktokAllowDuet,
    allowStitch: meta.tiktokAllowStitch,
    commercialDisclosure: meta.tiktokCommercial,
    brandOrganic: meta.tiktokBrandOrganic,
    brandedContent: meta.tiktokBrandedContent,
  };
}

/**
 * A video "requires user input" when TikTok is connected and its stored TikTok
 * options don't yet satisfy the publishing rules (e.g. no privacy chosen).
 */
function tiktokNeedsInput(v: VideoRecord, tiktokConnected: boolean): boolean {
  if (!tiktokConnected) return false;
  const opts = tiktokOptionsFromMeta(v.platformMeta.find((m) => m.platform === Platform.TIKTOK));
  return evaluateTikTokRequirements(opts).length > 0;
}

/** Map a Video row to a safe client DTO (BigInt → number, never exposes keys we don't need). */
function toVideoDto(v: VideoRecord, tiktokConnected = false) {
  return {
    id: v.id,
    status: v.status,
    aiStatus: v.aiStatus,
    cdnUrl: v.cdnUrl,
    originalFilename: v.originalFilename,
    mimeType: v.mimeType,
    fileSize: v.fileSize !== null && v.fileSize !== undefined ? Number(v.fileSize) : null,
    durationSec: v.durationSec,
    width: v.width,
    height: v.height,
    coverImageUrl: v.coverImageUrl,
    // What the grid shows: a user cover wins, else the AI-selected thumbnail.
    thumbnailUrl: v.coverImageUrl ?? v.selectedThumbnail?.url ?? null,
    title: v.title,
    caption: v.caption,
    hashtags: v.hashtags,
    categoryId: v.categoryId,
    category: v.category
      ? { id: v.category.id, name: v.category.name, color: v.category.color }
      : null,
    uploadSessionId: v.uploadSessionId,
    isDuplicate: v.isDuplicate,
    // True when this video already has a slot in the user's queue.
    inQueue: v._count.queueItems > 0,
    // True when the user must supply TikTok details before this can be queued.
    tiktokNeedsInput: tiktokNeedsInput(v, tiktokConnected),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export const mediaRouter = router({
  // -------------------------------------------------------------------------
  // Upload sessions + filter helpers
  // -------------------------------------------------------------------------

  /** Create a labelled batch that this afternoon's uploads belong to. */
  createUploadSession: protectedProcedure
    .input(createUploadSessionSchema)
    .mutation(({ ctx, input }) =>
      ctx.prisma.uploadSession.create({
        data: { userId: ctx.userId, label: input.label ?? null },
      }),
    ),

  /** Recent upload sessions (for the library filter). */
  listUploadSessions: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.uploadSession.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, label: true, videoCount: true, createdAt: true },
    }),
  ),

  /** Categories the user has (AI-created or manual) for filtering. */
  listCategories: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.category.findMany({
      where: { userId: ctx.userId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, color: true },
    }),
  ),

  // -------------------------------------------------------------------------
  // Direct-to-storage upload (video bytes never touch the app server)
  // -------------------------------------------------------------------------

  /**
   * Start an upload. Records a Video row in UPLOADING state, opens a multipart
   * upload in R2, and returns presigned PUT URLs — one per part. The client
   * uploads each part directly to storage, then calls `completeUpload`.
   */
  initUpload: protectedProcedure.input(initUploadSchema).mutation(async ({ ctx, input }) => {
    assertStorageConfigured();

    if (input.uploadSessionId) {
      const session = await ctx.prisma.uploadSession.findFirst({
        where: { id: input.uploadSessionId, userId: ctx.userId },
        select: { id: true },
      });
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload session not found.' });
      }
    }

    const ext = extensionFor(input.filename) || extensionForMime(input.contentType);

    // Create the row first so we have a stable id to build the storage key from.
    const video = await ctx.prisma.video.create({
      data: {
        userId: ctx.userId,
        status: 'UPLOADING',
        storageKey: '', // set below, once we know the id
        originalFilename: input.filename,
        mimeType: input.contentType,
        fileSize: BigInt(input.fileSize),
        durationSec: input.durationSec ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        hashtags: [],
        uploadSessionId: input.uploadSessionId ?? null,
      },
    });

    const key = sourceKey(ctx.userId, video.id, ext);

    try {
      const { uploadId } = await createMultipartUpload({ key, contentType: input.contentType });
      const { partSize, partCount } = planMultipart(input.fileSize);
      const parts = await presignUploadParts({ key, uploadId, partCount });

      await ctx.prisma.video.update({ where: { id: video.id }, data: { storageKey: key } });

      return { videoId: video.id, uploadId, key, partSize, partCount, parts };
    } catch (err) {
      // Roll back the placeholder row so a failed start doesn't leave junk.
      await ctx.prisma.video.delete({ where: { id: video.id } }).catch(() => {});
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Could not start the upload. Please try again.',
        cause: err,
      });
    }
  }),

  /** Finalize a multipart upload and mark the video ready for the AI pipeline. */
  completeUpload: protectedProcedure
    .input(completeUploadSchema)
    .mutation(async ({ ctx, input }) => {
      assertStorageConfigured();
      const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

      try {
        await completeMultipart({
          key: video.storageKey,
          uploadId: input.uploadId,
          parts: input.parts,
        });
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not finalize the upload. Please try again.',
          cause: err,
        });
      }

      // READY = uploaded and available; the AI pipeline (Chunk 5) picks up rows
      // whose aiStatus is still PENDING and enriches them.
      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: { status: 'READY', cdnUrl: publicUrlForKey(video.storageKey) },
        include: VIDEO_INCLUDE,
      });

      if (video.uploadSessionId) {
        await ctx.prisma.uploadSession.update({
          where: { id: video.uploadSessionId },
          data: { videoCount: { increment: 1 } },
        });
      }

      return toVideoDto(updated);
    }),

  /** Abandon an in-flight upload: abort the multipart upload and drop the row. */
  abortUpload: protectedProcedure.input(abortUploadSchema).mutation(async ({ ctx, input }) => {
    const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
    if (isStorageConfigured() && video.storageKey) {
      await abortMultipart({ key: video.storageKey, uploadId: input.uploadId }).catch(() => {});
    }
    await ctx.prisma.video.delete({ where: { id: video.id } });
    return { success: true as const };
  }),

  // -------------------------------------------------------------------------
  // Optional cover image
  // -------------------------------------------------------------------------

  /** Presign a single PUT for a cover image; client uploads then confirms. */
  initCoverUpload: protectedProcedure
    .input(initCoverUploadSchema)
    .mutation(async ({ ctx, input }) => {
      assertStorageConfigured();
      const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      const ext = extensionForMime(input.contentType) || '.jpg';
      const key = coverKey(ctx.userId, video.id, ext);
      const { url } = await presignPut({ key, contentType: input.contentType });
      // Stash the pending key now; `confirmCoverUpload` flips it to a public URL.
      await ctx.prisma.video.update({ where: { id: video.id }, data: { coverImageKey: key } });
      return { url, key };
    }),

  /** Record that the cover finished uploading (sets the public URL). */
  confirmCoverUpload: protectedProcedure
    .input(confirmCoverUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      if (!video.coverImageKey) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No cover upload in progress.',
        });
      }
      const updated = await ctx.prisma.video.update({
        where: { id: video.id },
        data: { coverImageUrl: publicUrlForKey(video.coverImageKey) },
        include: VIDEO_INCLUDE,
      });
      return toVideoDto(updated);
    }),

  // -------------------------------------------------------------------------
  // Browse / edit / delete
  // -------------------------------------------------------------------------

  /** Search + filter the library with cursor pagination. */
  list: protectedProcedure.input(listVideosSchema).query(async ({ ctx, input }) => {
    const where: Prisma.VideoWhereInput = { userId: ctx.userId };
    if (input.status) where.status = input.status;
    if (input.categoryId) where.categoryId = input.categoryId;
    if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;
    if (input.search) {
      const q = input.search;
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { caption: { contains: q, mode: 'insensitive' } },
        { originalFilename: { contains: q, mode: 'insensitive' } },
        { transcript: { contains: q, mode: 'insensitive' } },
        { hashtags: { has: q } },
      ];
    }

    const rows = await ctx.prisma.video.findMany({
      where,
      include: VIDEO_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (rows.length > input.limit) {
      nextCursor = rows.pop()!.id;
    }

    const tiktokConnected = await hasActiveTikTok(ctx.prisma, ctx.userId);
    return { items: rows.map((r) => toVideoDto(r, tiktokConnected)), nextCursor };
  }),

  /** Full detail for one video, including per-platform metadata + thumbnails. */
  get: protectedProcedure.input(videoIdSchema).query(async ({ ctx, input }) => {
    const video = await ctx.prisma.video.findFirst({
      where: { id: input.videoId, userId: ctx.userId },
      include: {
        category: true,
        selectedThumbnail: true,
        platformMeta: true,
        thumbnailCandidates: { orderBy: [{ score: 'desc' }, { frameTimeSec: 'asc' }] },
        _count: { select: { queueItems: true } },
      },
    });
    if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Video not found.' });
    const tiktokConnected = await hasActiveTikTok(ctx.prisma, ctx.userId);
    const tiktokMeta = video.platformMeta.find((m) => m.platform === Platform.TIKTOK);
    return {
      ...toVideoDto(video, tiktokConnected),
      transcript: video.transcript,
      selectedThumbnailId: video.selectedThumbnailId,
      // Whether TikTok is connected at all (drives whether the editor enforces
      // TikTok requirements) and the current stored TikTok options.
      tiktokConnected,
      tiktok: tiktokOptionsFromMeta(tiktokMeta),
      platformMeta: video.platformMeta.map((m) => ({
        platform: m.platform,
        title: m.title,
        caption: m.caption,
        hashtags: m.hashtags,
        aiGenerated: m.aiGenerated,
        edited: m.edited,
      })),
      thumbnails: video.thumbnailCandidates.map((t) => ({
        id: t.id,
        url: t.url,
        frameTimeSec: t.frameTimeSec,
        score: t.score,
      })),
    };
  }),

  /** Edit base (platform-agnostic) metadata. */
  updateMetadata: protectedProcedure
    .input(updateVideoMetadataSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

      if (input.categoryId) {
        const category = await ctx.prisma.category.findFirst({
          where: { id: input.categoryId, userId: ctx.userId },
          select: { id: true },
        });
        if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found.' });
      }

      const data: Prisma.VideoUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.caption !== undefined) data.caption = input.caption;
      if (input.hashtags !== undefined) data.hashtags = input.hashtags;
      if (input.categoryId !== undefined) {
        data.category = input.categoryId
          ? { connect: { id: input.categoryId } }
          : { disconnect: true };
      }

      const updated = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data,
        include: VIDEO_INCLUDE,
      });
      return toVideoDto(updated);
    }),

  /** Permanently delete a video and every object under its storage prefix. */
  remove: protectedProcedure.input(videoIdSchema).mutation(async ({ ctx, input }) => {
    const video = await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

    if (isStorageConfigured()) {
      await deletePrefix(videoPrefix(ctx.userId, video.id)).catch(() => {});
    }
    if (video.uploadSessionId) {
      await ctx.prisma.uploadSession
        .update({
          where: { id: video.uploadSessionId },
          data: { videoCount: { decrement: 1 } },
        })
        .catch(() => {});
    }
    await ctx.prisma.video.delete({ where: { id: video.id } });
    return { success: true as const };
  }),

  /** Bulk-delete videos (and their storage objects) the user owns. */
  removeMany: protectedProcedure.input(videoIdsSchema).mutation(async ({ ctx, input }) => {
    const videos = await ctx.prisma.video.findMany({
      where: { id: { in: input.videoIds }, userId: ctx.userId },
      select: { id: true, uploadSessionId: true },
    });
    if (videos.length === 0) return { deleted: 0 };

    if (isStorageConfigured()) {
      await Promise.all(
        videos.map((v) => deletePrefix(videoPrefix(ctx.userId, v.id)).catch(() => {})),
      );
    }

    // Keep each upload session's videoCount in sync.
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

    const { count } = await ctx.prisma.video.deleteMany({
      where: { id: { in: videos.map((v) => v.id) }, userId: ctx.userId },
    });
    return { deleted: count };
  }),

  /** Assign (or clear) a category for many videos the user owns at once. */
  setCategoryMany: protectedProcedure
    .input(setCategoryManySchema)
    .mutation(async ({ ctx, input }) => {
      if (input.categoryId) {
        const category = await ctx.prisma.category.findFirst({
          where: { id: input.categoryId, userId: ctx.userId },
          select: { id: true },
        });
        if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found.' });
      }

      const { count } = await ctx.prisma.video.updateMany({
        where: { id: { in: input.videoIds }, userId: ctx.userId },
        data: { categoryId: input.categoryId },
      });
      return { updated: count };
    }),

  // -------------------------------------------------------------------------
  // AI pipeline (heavy work runs in the worker — these just read state and
  // enqueue; they never call ffmpeg / OpenAI in the request handler)
  // -------------------------------------------------------------------------

  /** Counts by AI status (optionally scoped to one upload session). */
  aiSummary: protectedProcedure.input(aiSummarySchema).query(async ({ ctx, input }) => {
    const where: Prisma.VideoWhereInput = { userId: ctx.userId };
    if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;
    const grouped = await ctx.prisma.video.groupBy({
      by: ['aiStatus'],
      where,
      _count: { _all: true },
    });
    const counts = { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 };
    for (const g of grouped) counts[g.aiStatus] = g._count._all;
    return { ...counts, total: counts.PENDING + counts.RUNNING + counts.COMPLETED + counts.FAILED };
  }),

  /**
   * Queue videos for the AI worker by setting their `aiStatus` back to PENDING.
   * The worker (`npm run ai:process`) drains PENDING rows. Returns how many were
   * queued. RUNNING videos are left alone so we don't interrupt in-flight work.
   */
  regenerateMetadata: protectedProcedure
    .input(regenerateMetadataSchema)
    .mutation(async ({ ctx, input }) => {
      const where: Prisma.VideoWhereInput = {
        userId: ctx.userId,
        status: { in: ['READY', 'PROCESSING'] },
        aiStatus: input.onlyFailed ? 'FAILED' : { not: 'RUNNING' },
      };
      if (input.videoId) where.id = input.videoId;
      if (input.videoIds) where.id = { in: input.videoIds };
      if (input.uploadSessionId) where.uploadSessionId = input.uploadSessionId;

      const { count } = await ctx.prisma.video.updateMany({
        where,
        data: { aiStatus: 'PENDING' },
      });
      return { queued: count };
    }),

  /** Override the AI-chosen thumbnail with a specific candidate frame. */
  selectThumbnail: protectedProcedure
    .input(selectThumbnailSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      const thumb = await ctx.prisma.thumbnailCandidate.findFirst({
        where: { id: input.thumbnailId, videoId: input.videoId },
        select: { id: true },
      });
      if (!thumb) throw new TRPCError({ code: 'NOT_FOUND', message: 'Thumbnail not found.' });

      const updated = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { selectedThumbnailId: thumb.id },
        include: VIDEO_INCLUDE,
      });
      return toVideoDto(updated);
    }),

  /** Edit one platform's caption variant; marks it edited so AI won't overwrite. */
  setPlatformMeta: protectedProcedure
    .input(setPlatformMetaSchema)
    .mutation(async ({ ctx, input }) => {
      await ownedVideo(ctx.prisma, ctx.userId, input.videoId);
      const data = {
        title: input.title ?? null,
        caption: input.caption ?? null,
        hashtags: input.hashtags ?? [],
        edited: true,
      };
      await ctx.prisma.videoPlatformMeta.upsert({
        where: { videoId_platform: { videoId: input.videoId, platform: input.platform } },
        create: { videoId: input.videoId, platform: input.platform, aiGenerated: false, ...data },
        update: data,
      });
      return { success: true as const };
    }),

  /**
   * Save the TikTok Direct Post options (privacy, interaction abilities,
   * commercial disclosure) on the video's TikTok platform-meta row. Returns the
   * recomputed gate so the client can immediately reflect whether the video is
   * still blocked from the queue.
   */
  setTiktokMeta: protectedProcedure.input(setTiktokMetaSchema).mutation(async ({ ctx, input }) => {
    await ownedVideo(ctx.prisma, ctx.userId, input.videoId);

    // Enforce the "branded content can't be private" rule server-side too.
    const reasons = evaluateTikTokRequirements({
      privacy: input.privacy,
      allowComment: input.allowComment,
      allowDuet: input.allowDuet,
      allowStitch: input.allowStitch,
      commercialDisclosure: input.commercialDisclosure,
      brandOrganic: input.brandOrganic,
      brandedContent: input.brandedContent,
    });

    const data = {
      tiktokPrivacy: input.privacy,
      tiktokAllowComment: input.allowComment,
      tiktokAllowDuet: input.allowDuet,
      tiktokAllowStitch: input.allowStitch,
      tiktokCommercial: input.commercialDisclosure,
      tiktokBrandOrganic: input.brandOrganic,
      tiktokBrandedContent: input.brandedContent,
      edited: true,
    };
    await ctx.prisma.videoPlatformMeta.upsert({
      where: { videoId_platform: { videoId: input.videoId, platform: Platform.TIKTOK } },
      // `hashtags` is a non-nullable array with no DB default, so it must be
      // set when creating the row (only the update path leaves captions/tags
      // untouched).
      create: {
        videoId: input.videoId,
        platform: Platform.TIKTOK,
        aiGenerated: false,
        hashtags: [],
        ...data,
      },
      update: data,
    });
    return { success: true as const, blockingReasons: reasons };
  }),

  /** Videos flagged as (near-)duplicates, with their matches — for a dupe review view. */
  duplicates: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.video.findMany({
      where: { userId: ctx.userId, isDuplicate: true },
      include: VIDEO_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const tiktokConnected = await hasActiveTikTok(ctx.prisma, ctx.userId);
    return rows.map((r) => toVideoDto(r, tiktokConnected));
  }),
});
