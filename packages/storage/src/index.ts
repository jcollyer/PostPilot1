// Config + public URLs
export {
  getStorageConfig,
  isStorageConfigured,
  publicUrlForKey,
  type StorageConfig,
} from './config';

// Low-level client (workers/AI pipeline may need it directly)
export { getS3Client } from './client';

// Object-key layout
export {
  extensionFor,
  extensionForMime,
  videoPrefix,
  sourceKey,
  coverKey,
  thumbnailKey,
} from './keys';

// Server-side object IO (worker / AI pipeline only)
export { putObject, getObjectBuffer, downloadToFile } from './server-io';

// Presigned upload flows
export {
  planMultipart,
  createMultipartUpload,
  presignUploadParts,
  completeMultipart,
  abortMultipart,
  presignPut,
  deleteObject,
  deletePrefix,
  type MultipartPlan,
  type PresignedPart,
  type CompletedPart,
} from './presign';
