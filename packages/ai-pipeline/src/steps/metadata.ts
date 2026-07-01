import { z } from 'zod';

import { getOpenAI, VISION_MODEL } from '../config';
import type { StyleExample } from './style-examples';

/**
 * Vision-LLM metadata generation. Given a few representative frames plus the
 * transcript, the model acts like a content manager: it writes base metadata,
 * picks a category and the strongest thumbnail frame, and tailors a caption set
 * per platform (TikTok favors hooks/trends, YouTube favors searchable titles,
 * Instagram sits between).
 */

// Matches steps/frames.ts's SAMPLE_FRACTIONS length — send every candidate
// frame extractThumbnails produced, not a subset of it.
const MAX_FRAMES = 5;

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

/**
 * Explicit creator-set context (the CreatorProfile onboarding form + settings
 * card), as opposed to the *inferred* voice signals in style-examples.ts
 * (bio + past posts). Takes priority in the prompt since it's direct
 * instruction from the creator, not a guess.
 */
export interface CreatorProfileContext {
  niche: string | null;
  tone: string | null;
  audience: string | null;
  bannedWords: string[];
  exampleCaption: string | null;
  emojiPreference: 'NONE' | 'MODERATE' | 'HEAVY';
}

const EMOJI_GUIDANCE: Record<CreatorProfileContext['emojiPreference'], string> = {
  NONE: 'Do not use any emojis, anywhere.',
  MODERATE: 'Use emojis sparingly — only when they genuinely add something.',
  HEAVY: 'Use emojis liberally, matching an upbeat, emoji-forward caption style.',
};

const SYSTEM_PROMPT = `You are the content manager for a short-form video creator.
You are given sample frames from one vertical short video and (sometimes) its transcript.
Write publishing metadata. Be specific and engaging, never generic. Hashtags: lowercase,
no leading '#', 5-12 relevant tags.
Pick ONE concise category (1-2 words, e.g. "Travel", "Drone", "Cooking", "Fitness").
Choose the index of the most eye-catching frame for the thumbnail.
Tailor each platform: TikTok = punchy hook + trend-friendly; YouTube = clear searchable
title; Instagram = aesthetic, mid-length.
Three sources of voice context may follow, in priority order. If a creator profile is
given, it is the creator's own explicit instructions — follow it precisely, including its
banned words and emoji preference, and it overrides everything else below. If a creator
bio is given, use it to understand their niche and personality — it informs tone, never
gets quoted directly. If examples of this creator's past posts are given, use them ONLY to
match established voice, tone, caption length, and hashtag conventions — never copy their
specific topic, wording, or hashtags unless genuinely relevant to this new video. Absent
any of these, avoid clickbait and emoji-only captions.
Respond with ONLY a JSON object of the form:
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

/** Render the creator's explicit profile as a prompt block, or '' when unset. */
function buildCreatorProfileText(profile: CreatorProfileContext | null | undefined): string {
  if (!profile) return '';
  const lines: string[] = [];
  if (profile.niche) lines.push(`Niche: ${profile.niche}`);
  if (profile.tone) lines.push(`Tone: ${profile.tone}`);
  if (profile.audience) lines.push(`Audience: ${profile.audience}`);
  if (profile.bannedWords.length > 0) {
    lines.push(
      `Never use these words/phrases, under any circumstance: ${profile.bannedWords.join(', ')}`,
    );
  }
  if (profile.exampleCaption) {
    lines.push(
      `An example caption in the creator's own words (match this voice — don't reuse its topic): "${profile.exampleCaption.slice(0, 500)}"`,
    );
  }
  lines.push(`Emoji use: ${EMOJI_GUIDANCE[profile.emojiPreference]}`);
  return `\nCreator profile (set directly by the creator — highest priority, follow precisely):\n${lines.join('\n')}\n`;
}

/**
 * Case-insensitive whole-word/phrase removal — the hard guarantee behind a
 * creator's "words to avoid" list, since prompt instructions alone aren't
 * 100% reliable. Runs on every generated field, not just the prompt.
 */
function removeBannedWords(text: string, banned: string[]): string {
  if (!text || banned.length === 0) return text;
  let result = text;
  for (const phrase of banned) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '');
  }
  return result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

function removeBannedFromHashtags(hashtags: string[], banned: string[]): string[] {
  if (banned.length === 0) return hashtags;
  const bannedLower = new Set(banned.map((b) => b.trim().toLowerCase()).filter(Boolean));
  return hashtags.filter((h) => !bannedLower.has(h.toLowerCase()));
}

/** Apply the banned-words filter to every text field of a generated result. */
function applyBannedWords(meta: GeneratedMetadata, banned: string[]): GeneratedMetadata {
  if (banned.length === 0) return meta;
  const clean = (p: PlatformMeta): PlatformMeta => ({
    title: removeBannedWords(p.title, banned),
    caption: removeBannedWords(p.caption, banned),
    hashtags: removeBannedFromHashtags(p.hashtags, banned),
  });
  return {
    ...meta,
    title: removeBannedWords(meta.title, banned),
    caption: removeBannedWords(meta.caption, banned),
    hashtags: removeBannedFromHashtags(meta.hashtags, banned),
    platforms: {
      TIKTOK: clean(meta.platforms.TIKTOK),
      INSTAGRAM: clean(meta.platforms.INSTAGRAM),
      YOUTUBE: clean(meta.platforms.YOUTUBE),
    },
  };
}

/** Render past-post exemplars as a prompt block, or '' when there are none. */
function buildStyleExamplesText(examples: StyleExample[]): string {
  if (examples.length === 0) return '';
  const blocks = examples
    .map((ex, i) => {
      const hashtags = ex.hashtags.length ? ex.hashtags.join(', ') : '(none)';
      return `${i + 1}. Title: ${ex.title || '(none)'}\n   Caption: ${ex.caption || '(none)'}\n   Hashtags: ${hashtags}\n   Category: ${ex.category || '(none)'}`;
    })
    .join('\n');
  return `\nThis creator's past posts (voice/tone/hashtag-style reference ONLY — do not reuse their topics or wording):\n${blocks}\n`;
}

/** Run the vision model over up to MAX_FRAMES frames + transcript and parse the result. */
export async function generateMetadata(params: {
  frames: Buffer[];
  transcript: string | null;
  durationSec: number | null;
  creatorBio?: string | null;
  styleExamples?: StyleExample[];
  creatorProfile?: CreatorProfileContext | null;
}): Promise<GeneratedMetadata> {
  // extractThumbnails samples MAX_FRAMES candidates (steps/frames.ts's
  // SAMPLE_FRACTIONS) — send all of them, not just the first 4, so the model
  // can actually see (and pick as thumbnail) the near-the-end frame too.
  // 'high' detail lets it use the source resolution ffmpeg captured instead
  // of a downscaled 512x512 pass — worth it for a hook-picking/context task,
  // at the cost of materially more tokens per image than 'low' (~85 tokens
  // flat) — expect several hundred to ~1000+ tokens per frame depending on
  // source resolution.
  const frames = params.frames.slice(0, MAX_FRAMES);
  const imageContent = frames.map((buf) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}`, detail: 'high' as const },
  }));

  const transcriptText = params.transcript
    ? `Transcript:\n${params.transcript.slice(0, 6000)}`
    : 'Transcript: (none — silent or music-only video; rely on the frames).';
  const durationText = params.durationSec
    ? `Video duration: ~${Math.round(params.durationSec)}s.`
    : '';
  const bioText = params.creatorBio
    ? `Creator bio (from their own platform profile): ${params.creatorBio.slice(0, 500)}`
    : '';
  const profileText = buildCreatorProfileText(params.creatorProfile);
  const examplesText = buildStyleExamplesText(params.styleExamples ?? []);

  const completion = await getOpenAI().chat.completions.create({
    model: VISION_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${durationText}\n${profileText}\n${bioText}\n${transcriptText}\n${examplesText}\nFrames follow in order:`,
          },
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

  return applyBannedWords(base, params.creatorProfile?.bannedWords ?? []);
}
