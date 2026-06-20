import { Platform, type PrismaClient } from '@postpilot/db';

import type { GeneratedMetadata } from './metadata';

/** url-safe slug from a category name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04'];

/** Deterministic color per category so the same category always looks the same. */
function colorFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Upsert the category and return its id (or null when the model gave none). */
async function ensureCategory(
  prisma: PrismaClient,
  userId: string,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const slug = slugify(trimmed);
  if (!slug) return null;
  const category = await prisma.category.upsert({
    where: { userId_slug: { userId, slug } },
    create: { userId, name: trimmed, slug, color: colorFor(slug) },
    update: {}, // keep existing name/color if the category already exists
    select: { id: true },
  });
  return category.id;
}

/**
 * Write generated metadata: base fields on Video, the chosen category, the
 * selected thumbnail, and one VideoPlatformMeta row per platform. Per-platform
 * rows the user has already hand-edited are left untouched (edited = true).
 */
export async function persistMetadata(
  prisma: PrismaClient,
  params: {
    userId: string;
    videoId: string;
    metadata: GeneratedMetadata;
    selectedThumbnailId: string | null;
  },
): Promise<void> {
  const { userId, videoId, metadata } = params;
  const categoryId = await ensureCategory(prisma, userId, metadata.category);

  await prisma.video.update({
    where: { id: videoId },
    data: {
      title: metadata.title || null,
      caption: metadata.caption || null,
      hashtags: metadata.hashtags,
      categoryId,
      ...(params.selectedThumbnailId ? { selectedThumbnailId: params.selectedThumbnailId } : {}),
    },
  });

  const platforms: Array<[Platform, { title: string; caption: string; hashtags: string[] }]> = [
    [Platform.TIKTOK, metadata.platforms.TIKTOK],
    [Platform.INSTAGRAM, metadata.platforms.INSTAGRAM],
    [Platform.YOUTUBE, metadata.platforms.YOUTUBE],
  ];

  for (const [platform, meta] of platforms) {
    const existing = await prisma.videoPlatformMeta.findUnique({
      where: { videoId_platform: { videoId, platform } },
      select: { edited: true },
    });
    if (existing?.edited) continue; // don't overwrite user edits

    await prisma.videoPlatformMeta.upsert({
      where: { videoId_platform: { videoId, platform } },
      create: {
        videoId,
        platform,
        title: meta.title || null,
        caption: meta.caption || null,
        hashtags: meta.hashtags,
        aiGenerated: true,
        edited: false,
      },
      update: {
        title: meta.title || null,
        caption: meta.caption || null,
        hashtags: meta.hashtags,
        aiGenerated: true,
      },
    });
  }
}
