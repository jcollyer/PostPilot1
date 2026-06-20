import { z } from 'zod';

import { mediaStatusSchema, platformSchema } from './domain';

/**
 * Shared validation for the Media Library. The web/mobile clients and the API
 * validate against these same rules.
 *
 * Upload model: video bytes never pass through the app server. The client asks
 * the server to `initUpload` (which records a Video row and starts a multipart
 * upload), PUTs each part straight to storage using the presigned URLs, then
 * calls `completeUpload` with the part etags so the server can finalize.
 */

// Video files we accept. Keep this in sync with any client-side `accept` attr.
export const ACCEPTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** 10 GB — generous headroom over the platforms' own limits. */
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024 * 1024;
/** 15 MB cap for optional cover images. */
export const MAX_COVER_BYTES = 15 * 1024 * 1024;

export const videoMimeSchema = z.enum(ACCEPTED_VIDEO_MIME_TYPES);
export const imageMimeSchema = z.enum(ACCEPTED_IMAGE_MIME_TYPES);

/** Create a labelled batch (an "upload session") that videos can belong to. */
export const createUploadSessionSchema = z.object({
  label: z.string().trim().max(120).optional(),
});
export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>;

/** Start an upload: server creates the Video row + multipart upload. */
export const initUploadSchema = z.object({
  filename: z.string().trim().min(1).max(400),
  contentType: videoMimeSchema,
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_VIDEO_BYTES, 'That video is larger than the 10 GB limit'),
  uploadSessionId: z.string().min(1).optional(),
  // Optional client-provided probe metadata (best effort; AI pipeline confirms).
  durationSec: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;

export const uploadedPartSchema = z.object({
  partNumber: z.number().int().positive(),
  etag: z.string().min(1),
});
export type UploadedPart = z.infer<typeof uploadedPartSchema>;

/** Finalize a multipart upload after every part has been PUT to storage. */
export const completeUploadSchema = z.object({
  videoId: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z.array(uploadedPartSchema).min(1),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

/** Abandon an in-flight upload (client cancelled / failed). */
export const abortUploadSchema = z.object({
  videoId: z.string().min(1),
  uploadId: z.string().min(1),
});
export type AbortUploadInput = z.infer<typeof abortUploadSchema>;

/** Ask for a presigned PUT to upload an optional cover image. */
export const initCoverUploadSchema = z.object({
  videoId: z.string().min(1),
  contentType: imageMimeSchema,
  fileSize: z.number().int().positive().max(MAX_COVER_BYTES, 'Cover image is too large'),
});
export type InitCoverUploadInput = z.infer<typeof initCoverUploadSchema>;

/** Record that the cover image finished uploading. */
export const confirmCoverUploadSchema = z.object({
  videoId: z.string().min(1),
});
export type ConfirmCoverUploadInput = z.infer<typeof confirmCoverUploadSchema>;

/** Edit base (platform-agnostic) metadata on a video. */
export const updateVideoMetadataSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().trim().max(150).nullish(),
  caption: z.string().trim().max(5000).nullish(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(60).optional(),
  categoryId: z.string().min(1).nullish(),
});
export type UpdateVideoMetadataInput = z.infer<typeof updateVideoMetadataSchema>;

/** List / search / filter the library, with cursor pagination. */
export const listVideosSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: mediaStatusSchema.optional(),
  categoryId: z.string().min(1).optional(),
  uploadSessionId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(24),
  cursor: z.string().min(1).optional(),
});
export type ListVideosInput = z.infer<typeof listVideosSchema>;

export const videoIdSchema = z.object({ videoId: z.string().min(1) });
export type VideoIdInput = z.infer<typeof videoIdSchema>;

// ---------------------------------------------------------------------------
// AI pipeline (Chunk 5)
// ---------------------------------------------------------------------------

/**
 * Queue videos for (re)processing by the AI worker. Scope is one of: a single
 * video, a whole upload session, or — if neither is given — all of the user's
 * videos. `onlyFailed` re-runs just the ones that previously failed.
 */
export const regenerateMetadataSchema = z.object({
  videoId: z.string().min(1).optional(),
  uploadSessionId: z.string().min(1).optional(),
  onlyFailed: z.boolean().optional().default(false),
});
export type RegenerateMetadataInput = z.infer<typeof regenerateMetadataSchema>;

/** Override the AI-selected thumbnail with one of the candidate frames. */
export const selectThumbnailSchema = z.object({
  videoId: z.string().min(1),
  thumbnailId: z.string().min(1),
});
export type SelectThumbnailInput = z.infer<typeof selectThumbnailSchema>;

/** Edit a per-platform caption variant (marks it user-edited so AI won't clobber it). */
export const setPlatformMetaSchema = z.object({
  videoId: z.string().min(1),
  platform: platformSchema,
  title: z.string().trim().max(150).nullish(),
  caption: z.string().trim().max(5000).nullish(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(60).optional(),
});
export type SetPlatformMetaInput = z.infer<typeof setPlatformMetaSchema>;

/** Optional scope for the AI-status summary counts. */
export const aiSummarySchema = z.object({
  uploadSessionId: z.string().min(1).optional(),
});
export type AiSummaryInput = z.infer<typeof aiSummarySchema>;
