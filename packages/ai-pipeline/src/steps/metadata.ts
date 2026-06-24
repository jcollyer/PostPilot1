import { z } from 'zod';

import { getOpenAI, VISION_MODEL } from '../config';

/**
 * Vision-LLM metadata generation. Given a few representative frames plus the
 * transcript, the model acts like a content manager: it writes base metadata,
 * picks a category and the strongest thumbnail frame, and tailors a caption set
 * per platform (TikTok favors hooks/trends, YouTube favors searchable titles,
 * Instagram sits between).
 */

const platformMetaSchema = z.object({
  title: z.string().max(150).optional().default(''),
  caption: z.string().max(2200).optional().default(''),
  hashtags: z.array(z.string()).max(30).optional().default([]),
});

const rawSchema = z.object({
  title: z.string().max(150).optional().default(''),
  caption: z.string().max(2200).optional().default(''),
  hashtags: z.array(z.string()).max(30).optional().default([]),
  category: z.string().max(40).optional().default(''),
  bestFrameIndex: z.number().int().optional().default(0),
  platforms: z
    .object({
      TIKTOK: platformMetaSchema.optional(),
      INSTAGRAM: platformMetaSchema.optional(),
      YOUTUBE: platformMetaSchema.optional(),
    })
    .optional()
    .default({}),
});

export interface PlatformMeta {
  title: string;
  caption: string;
  hashtags: string[];
}

export interface GeneratedMetadata {
  title: string;
  caption: string;
  hashtags: string[];
  category: string;
  bestFrameIndex: number;
  platforms: { TIKTOK: PlatformMeta; INSTAGRAM: PlatformMeta; YOUTUBE: PlatformMeta };
}

const SYSTEM_PROMPT = `You are the content manager for a short-form video creator.
You are given sample frames from one vertical short video and (sometimes) its transcript.
Write publishing metadata. Be specific and engaging, never generic. Avoid clickbait and
emojis-only captions. Hashtags: lowercase, no leading '#', 5-12 relevant tags.
Pick ONE concise category (1-2 words, e.g. "Travel", "Drone", "Cooking", "Fitness").
Choose the index of the most eye-catching frame for the thumbnail.
Tailor each platform: TikTok = punchy hook + trend-friendly; YouTube = clear searchable
title; Instagram = aesthetic, mid-length. Respond with ONLY a JSON object of the form:
{"title","caption","hashtags":[],"category","bestFrameIndex",
 "platforms":{"TIKTOK":{"title","caption","hashtags":[]},
 "INSTAGRAM":{...},"YOUTUBE":{...}}}`;

function normalizeHashtags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags.map((t) => t.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean),
    ),
  ).slice(0, 30);
}

function platformOf(p: PlatformMeta | undefined, fallback: GeneratedMetadata): PlatformMeta {
  return {
    title: p?.title?.trim() || fallback.title,
    caption: p?.caption?.trim() || fallback.caption,
    hashtags: normalizeHashtags(p?.hashtags?.length ? p.hashtags : fallback.hashtags),
  };
}

/** Run the vision model over up to 4 frames + transcript and parse the result. */
export async function generateMetadata(params: {
  frames: Buffer[];
  transcript: string | null;
  durationSec: number | null;
}): Promise<GeneratedMetadata> {
  const frames = params.frames.slice(0, 4);
  const imageContent = frames.map((buf) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}`, detail: 'low' as const },
  }));

  const transcriptText = params.transcript
    ? `Transcript:\n${params.transcript.slice(0, 6000)}`
    : 'Transcript: (none — silent or music-only video; rely on the frames).';
  const durationText = params.durationSec
    ? `Video duration: ~${Math.round(params.durationSec)}s.`
    : '';

  const completion = await getOpenAI().chat.completions.create({
    model: VISION_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `${durationText}\n${transcriptText}\nFrames follow in order:` },
          ...imageContent,
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? '{}';
  let parsed: z.infer<typeof rawSchema>;
  try {
    parsed = rawSchema.parse(JSON.parse(content));
  } catch {
    parsed = rawSchema.parse({});
  }

  const base: GeneratedMetadata = {
    title: parsed.title.trim(),
    caption: parsed.caption.trim(),
    hashtags: normalizeHashtags(parsed.hashtags),
    category: parsed.category.trim(),
    bestFrameIndex: Math.min(Math.max(0, parsed.bestFrameIndex), Math.max(0, frames.length - 1)),
    // placeholder; filled below once `base` exists
    platforms: {
      TIKTOK: { title: '', caption: '', hashtags: [] },
      INSTAGRAM: { title: '', caption: '', hashtags: [] },
      YOUTUBE: { title: '', caption: '', hashtags: [] },
    },
  };

  base.platforms = {
    TIKTOK: platformOf(parsed.platforms.TIKTOK, base),
    INSTAGRAM: platformOf(parsed.platforms.INSTAGRAM, base),
    YOUTUBE: platformOf(parsed.platforms.YOUTUBE, base),
  };

  return base;
}
