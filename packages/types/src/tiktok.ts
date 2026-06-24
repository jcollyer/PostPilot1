import { z } from 'zod';

/**
 * TikTok Direct Post (Content Posting API) options + the rules from TikTok's
 * "UX Guidelines for Unaudited Clients". Shared by the API, the publish
 * adapter, and the web client so the gate is computed identically everywhere.
 *
 * Key rule: privacy level has NO default — the creator must manually pick one
 * before a TikTok post can be queued/published. That single requirement is the
 * main thing that puts a video into the "requires user input" state.
 */

/** Privacy levels TikTok's `creator_info` may return in `privacy_level_options`. */
export const TIKTOK_PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const;
export const tiktokPrivacySchema = z.enum(TIKTOK_PRIVACY_LEVELS);
export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

/** Human labels for the privacy dropdown. */
export const TIKTOK_PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: 'Public — everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends (mutual follows)',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me (private)',
};

/** The full set of TikTok posting options we store per video. */
export interface TikTokPostOptions {
  /** null until the user manually selects one (TikTok mandates no default). */
  privacy: TikTokPrivacyLevel | null;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Commercial content disclosure toggle (off by default). */
  commercialDisclosure: boolean;
  /** "Your brand" — Brand Organic. */
  brandOrganic: boolean;
  /** "Branded content" — Paid partnership. */
  brandedContent: boolean;
}

/** Sensible defaults for a brand-new TikTok meta row (everything off, no privacy). */
export const DEFAULT_TIKTOK_OPTIONS: TikTokPostOptions = {
  privacy: null,
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercialDisclosure: false,
  brandOrganic: false,
  brandedContent: false,
};

/**
 * Validate TikTok options against the publishing rules. Returns the blocking
 * reasons (empty array = ready to publish). Used to gate "Add to queue" and to
 * show inline guidance in the editor.
 */
export function evaluateTikTokRequirements(opts: TikTokPostOptions): string[] {
  const reasons: string[] = [];

  // 1. Privacy must be explicitly chosen — there is no valid default.
  if (!opts.privacy) {
    reasons.push('Choose who can view this TikTok video.');
  }

  // 2. If commercial disclosure is on, at least one brand option is required.
  if (opts.commercialDisclosure && !opts.brandOrganic && !opts.brandedContent) {
    reasons.push('Indicate if your content promotes yourself, a third party, or both.');
  }

  // 3. Branded content cannot be posted privately.
  if (opts.commercialDisclosure && opts.brandedContent && opts.privacy === 'SELF_ONLY') {
    reasons.push('Branded content visibility cannot be set to private.');
  }

  return reasons;
}

/**
 * The consent declaration shown above the publish/queue action. The wording
 * depends on the commercial-content selections (TikTok compliance requirement).
 */
export function tiktokConsentDeclaration(opts: TikTokPostOptions): string {
  const branded = opts.commercialDisclosure && opts.brandedContent;
  return branded
    ? "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation."
    : "By posting, you agree to TikTok's Music Usage Confirmation.";
}

/**
 * The label TikTok will apply to the post, derived from the brand selections.
 * Returns null when commercial disclosure is off.
 */
export function tiktokContentLabel(opts: TikTokPostOptions): 'Promotional content' | 'Paid partnership' | null {
  if (!opts.commercialDisclosure) return null;
  if (opts.brandedContent) return 'Paid partnership';
  if (opts.brandOrganic) return 'Promotional content';
  return null;
}

/** Persist TikTok options for a video's TikTok platform-meta row. */
export const setTiktokMetaSchema = z.object({
  videoId: z.string().min(1),
  privacy: tiktokPrivacySchema.nullable(),
  allowComment: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  commercialDisclosure: z.boolean(),
  brandOrganic: z.boolean(),
  brandedContent: z.boolean(),
});
export type SetTiktokMetaInput = z.infer<typeof setTiktokMetaSchema>;
