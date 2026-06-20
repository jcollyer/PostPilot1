import { prisma } from '@saas/db';

import { processVideo, type ProcessResult } from './pipeline';

/**
 * Claim and process videos whose AI metadata is still PENDING. The "Generate
 * Metadata" button simply sets videos back to PENDING; this worker drains them.
 * Processed sequentially to stay within API rate limits and CPU on the worker.
 */
export async function processPending(params?: {
  limit?: number;
  userId?: string;
}): Promise<ProcessResult[]> {
  const limit = params?.limit ?? 25;

  const pending = await prisma.video.findMany({
    where: {
      aiStatus: 'PENDING',
      status: { in: ['READY', 'PROCESSING'] },
      ...(params?.userId ? { userId: params.userId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  const results: ProcessResult[] = [];
  for (const { id } of pending) {
    results.push(await processVideo(id));
  }
  return results;
}

/** Process every still-PENDING video in a specific upload session. */
export async function processUploadSession(uploadSessionId: string): Promise<ProcessResult[]> {
  const pending = await prisma.video.findMany({
    where: { uploadSessionId, aiStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const results: ProcessResult[] = [];
  for (const { id } of pending) {
    results.push(await processVideo(id));
  }
  return results;
}
