import { Platform, prisma, type PrismaClient } from '@postpilot/db';
import { getFreshAccessToken, markNeedsReconnect } from '@postpilot/connectors';
import { getObjectBuffer } from '@postpilot/storage';

import { getPublishAdapter } from './adapters';
import { backoffMs, MAX_POLLS, MAX_PUBLISH_ATTEMPTS, POLL_INTERVAL_MS } from './config';
import { PublishError } from './http';
import {
  contentRejectedNotification,
  createNotification,
  publishFailedNotification,
} from './notify';
import type { PublishInput } from './types';

export interface PublishRunResult {
  taskId: string;
  platform: Platform;
  outcome: 'published' | 'processing' | 'retry' | 'failed' | 'held' | 'skipped';
  detail?: string;
}

type TaskWithRelations = NonNullable<Awaited<ReturnType<typeof loadTask>>>;

function loadTask(client: PrismaClient, taskId: string) {
  return client.publishTask.findUnique({
    where: { id: taskId },
    include: {
      connection: true,
      queueItem: {
        include: {
          video: {
            include: { platformMeta: true },
          },
        },
      },
    },
  });
}

/**
 * Process all publish tasks that are due: SCHEDULED tasks whose time has come,
 * and PROCESSING tasks ready for another status poll. Sequential to respect
 * platform rate limits. Pure orchestration over the `Publish(Video)` adapters.
 */
export async function publishDueTasks(opts?: { limit?: number }): Promise<PublishRunResult[]> {
  const now = new Date();
  const dueFilter = { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] };

  const tasks = await prisma.publishTask.findMany({
    where: {
      OR: [
        { status: 'SCHEDULED', scheduledAt: { lte: now }, AND: [dueFilter] },
        { status: 'PROCESSING', AND: [dueFilter] },
      ],
    },
    orderBy: { scheduledAt: 'asc' },
    take: opts?.limit ?? 25,
    select: { id: true },
  });

  const results: PublishRunResult[] = [];
  for (const { id } of tasks) {
    results.push(await processTask(id));
  }
  return results;
}

/** Process a single task end to end, then roll up its queue item's status. */
export async function processTask(taskId: string): Promise<PublishRunResult> {
  const task = await loadTask(prisma, taskId);
  if (!task) return { taskId, platform: Platform.TIKTOK, outcome: 'skipped', detail: 'not found' };

  let result: PublishRunResult;
  try {
    result = task.status === 'PROCESSING' ? await pollTask(task) : await startPublish(task);
  } catch (err) {
    result = await handleError(task, err);
  }
  await rollupItemStatus(task.queueItemId);
  return result;
}

/** Resolve a fresh token; on failure the platform is held (and flagged elsewhere). */
async function resolveToken(task: TaskWithRelations): Promise<string | null> {
  if (!task.connectionId || !task.connection || task.connection.status !== 'ACTIVE') return null;
  try {
    return await getFreshAccessToken(task.connectionId);
  } catch {
    return null;
  }
}

function buildInput(task: TaskWithRelations, accessToken: string): PublishInput {
  const video = task.queueItem.video;
  const meta = video.platformMeta.find((m) => m.platform === task.platform);
  return {
    accessToken,
    externalAccountId: task.connection!.externalAccountId,
    videoUrl: video.cdnUrl ?? '',
    getBytes: () => getObjectBuffer(video.storageKey),
    mimeType: video.mimeType,
    fileSize: video.fileSize != null ? Number(video.fileSize) : null,
    durationSec: video.durationSec,
    title: meta?.title || video.title || '',
    caption: meta?.caption || video.caption || '',
    hashtags: (meta?.hashtags?.length ? meta.hashtags : video.hashtags) ?? [],
    // TikTok Direct Post options the creator set in the editor.
    tiktok:
      task.platform === Platform.TIKTOK && meta
        ? {
            privacy: meta.tiktokPrivacy,
            allowComment: meta.tiktokAllowComment,
            allowDuet: meta.tiktokAllowDuet,
            allowStitch: meta.tiktokAllowStitch,
            commercialDisclosure: meta.tiktokCommercial,
            brandOrganic: meta.tiktokBrandOrganic,
            brandedContent: meta.tiktokBrandedContent,
          }
        : null,
  };
}

async function startPublish(task: TaskWithRelations): Promise<PublishRunResult> {
  const token = await resolveToken(task);
  if (!token) return holdTask(task, 'connection not active');

  const video = task.queueItem.video;
  // TikTok + Instagram fetch the file from a public URL; YouTube uploads bytes.
  if (task.platform !== Platform.YOUTUBE && !video.cdnUrl) {
    return failTask(task, 'video has no public URL yet', { reject: true });
  }

  const adapter = getPublishAdapter(task.platform);
  const res = await adapter.publish(buildInput(task, token));

  if (res.state === 'PUBLISHED') {
    await prisma.publishTask.update({
      where: { id: task.id },
      data: {
        status: 'PUBLISHED',
        platformPostId: res.platformPostId ?? null,
        platformPostUrl: res.platformPostUrl ?? null,
        publishedAt: new Date(),
        lastError: null,
      },
    });
    return { taskId: task.id, platform: task.platform, outcome: 'published' };
  }

  // PROCESSING — poll later. Reset attemptCount to count polls.
  await prisma.publishTask.update({
    where: { id: task.id },
    data: {
      status: 'PROCESSING',
      externalContainerId: res.externalContainerId ?? null,
      attemptCount: 0,
      nextAttemptAt: new Date(Date.now() + POLL_INTERVAL_MS),
      lastError: null,
    },
  });
  return { taskId: task.id, platform: task.platform, outcome: 'processing' };
}

async function pollTask(task: TaskWithRelations): Promise<PublishRunResult> {
  const adapter = getPublishAdapter(task.platform);
  if (!adapter.poll || !task.externalContainerId) {
    return failTask(task, 'nothing to poll', { reject: true });
  }
  const token = await resolveToken(task);
  if (!token) return holdTask(task, 'connection not active');

  const res = await adapter.poll({
    accessToken: token,
    externalAccountId: task.connection!.externalAccountId,
    containerId: task.externalContainerId,
  });

  if (res.state === 'PUBLISHED') {
    await prisma.publishTask.update({
      where: { id: task.id },
      data: {
        status: 'PUBLISHED',
        platformPostId: res.platformPostId ?? task.platformPostId,
        platformPostUrl: res.platformPostUrl ?? task.platformPostUrl,
        publishedAt: new Date(),
        lastError: null,
      },
    });
    return { taskId: task.id, platform: task.platform, outcome: 'published' };
  }
  if (res.state === 'FAILED') {
    return failTask(task, res.error ?? 'platform reported failure', { reject: false });
  }

  // Still processing — re-poll until we hit the cap.
  const polls = task.attemptCount + 1;
  if (polls >= MAX_POLLS) {
    return failTask(task, 'timed out waiting for the platform to finish processing', {
      reject: false,
    });
  }
  await prisma.publishTask.update({
    where: { id: task.id },
    data: { attemptCount: polls, nextAttemptAt: new Date(Date.now() + POLL_INTERVAL_MS) },
  });
  return { taskId: task.id, platform: task.platform, outcome: 'processing' };
}

/** Map a thrown PublishError onto the right task transition. */
async function handleError(task: TaskWithRelations, err: unknown): Promise<PublishRunResult> {
  if (err instanceof PublishError) {
    if (err.needsReconnect) {
      if (task.connection) await markNeedsReconnect(task.connection, err.message);
      return holdTask(task, 'reconnect required');
    }
    if (err.rejected) return failTask(task, err.message, { reject: true });
    // Recoverable: back off and retry, or give up after MAX_PUBLISH_ATTEMPTS.
    const attempts = task.attemptCount + 1;
    if (attempts >= MAX_PUBLISH_ATTEMPTS) {
      return failTask(task, err.message, { reject: false });
    }
    await prisma.publishTask.update({
      where: { id: task.id },
      data: {
        attemptCount: attempts,
        nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
        lastError: err.message.slice(0, 1000),
      },
    });
    return { taskId: task.id, platform: task.platform, outcome: 'retry', detail: err.message };
  }
  // Unknown error → treat as a transient retry.
  const attempts = task.attemptCount + 1;
  const message = err instanceof Error ? err.message : String(err);
  if (attempts >= MAX_PUBLISH_ATTEMPTS) return failTask(task, message, { reject: false });
  await prisma.publishTask.update({
    where: { id: task.id },
    data: {
      attemptCount: attempts,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      lastError: message.slice(0, 1000),
    },
  });
  return { taskId: task.id, platform: task.platform, outcome: 'retry', detail: message };
}

async function holdTask(task: TaskWithRelations, detail: string): Promise<PublishRunResult> {
  await prisma.publishTask.update({
    where: { id: task.id },
    data: { status: 'HELD', lastError: detail.slice(0, 1000) },
  });
  return { taskId: task.id, platform: task.platform, outcome: 'held', detail };
}

async function failTask(
  task: TaskWithRelations,
  detail: string,
  opts: { reject: boolean },
): Promise<PublishRunResult> {
  await prisma.publishTask.update({
    where: { id: task.id },
    data: { status: 'FAILED', lastError: detail.slice(0, 1000) },
  });
  const userId = task.connection?.userId;
  if (userId) {
    const tmpl = opts.reject
      ? contentRejectedNotification(task.platform)
      : publishFailedNotification(task.platform);
    await createNotification(prisma, {
      userId,
      ...tmpl,
      platform: task.platform,
      relatedVideoId: task.queueItem.videoId,
      dedupeKey: `${opts.reject ? 'rejected' : 'failed'}:${task.platform}:${task.queueItem.videoId}`,
    });
  }
  return { taskId: task.id, platform: task.platform, outcome: 'failed', detail };
}

/**
 * Roll a queue item's status up from its tasks: COMPLETED once every task is
 * terminal, PUBLISHING while any is in flight or already posted.
 */
async function rollupItemStatus(queueItemId: string): Promise<void> {
  const tasks = await prisma.publishTask.findMany({
    where: { queueItemId },
    select: { status: true },
  });
  if (tasks.length === 0) return;

  const terminal = (s: string) => s === 'PUBLISHED' || s === 'FAILED' || s === 'SKIPPED';
  const allTerminal = tasks.every((t) => terminal(t.status));
  const anyActive = tasks.some((t) => t.status === 'PUBLISHED' || t.status === 'PROCESSING');

  const item = await prisma.queueItem.findUnique({
    where: { id: queueItemId },
    select: { status: true },
  });
  if (!item || item.status === 'SKIPPED' || item.status === 'CANCELED') return;

  const next = allTerminal ? 'COMPLETED' : anyActive ? 'PUBLISHING' : item.status;
  if (next !== item.status) {
    await prisma.queueItem.update({ where: { id: queueItemId }, data: { status: next } });
  }
}
