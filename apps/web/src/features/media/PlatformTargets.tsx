'use client';

import { useMemo } from 'react';

import { PLATFORM_LABELS, platformSchema, type Platform } from '@postpilot/types';

import { trpc } from '@/lib/trpc/client';

/**
 * Per-video platform targeting UI.
 *
 * A video's `targetPlatforms` is the explicit set of platforms it publishes to;
 * an empty array means "all connected platforms" (the default cross-post). For
 * display we expand that default to all three toggles being on, so the picker
 * always shows TikTok / Instagram / YouTube and marks any that aren't connected
 * yet (they still publish once connected — the queue holds them).
 */

export const PLATFORM_ORDER: Platform[] = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE'];

const PLATFORM_SHORT: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
};

/** Which platforms have an ACTIVE connection right now. */
export function useConnectedPlatforms(): { connected: Set<Platform>; isLoading: boolean } {
  const overview = trpc.connections.overview.useQuery();
  const connected = useMemo(() => {
    const set = new Set<Platform>();
    for (const entry of overview.data ?? []) {
      if (entry.connection?.status === 'ACTIVE') set.add(entry.platform);
    }
    return set;
  }, [overview.data]);
  return { connected, isLoading: overview.isLoading };
}

/**
 * The connected TikTok creator's account, pulled live from `creator_info`.
 *
 * TikTok guideline 1A: the upload page must display the creator's nickname so
 * the user knows which account the content will be posted to. We retrieve the
 * latest creator info (as 1 requires) rather than a stale cached name. The
 * underlying query is shared/deduped by React Query, so calling this from both
 * the library and the editor is a single TikTok API hit.
 *
 * Returns nulls until the live call resolves (or if TikTok isn't connected).
 */
export function useTikTokAccount(): {
  nickname: string | null;
  username: string | null;
  avatarUrl: string | null;
  isLoading: boolean;
} {
  const { connected } = useConnectedPlatforms();
  const tiktokConnected = connected.has('TIKTOK');
  const creatorInfo = trpc.connections.tiktokCreatorInfo.useQuery(undefined, {
    enabled: tiktokConnected,
  });
  const live = creatorInfo.data?.available ? creatorInfo.data.info : null;
  return {
    nickname: live?.creatorNickname ?? null,
    username: live?.creatorUsername ?? null,
    avatarUrl: live?.creatorAvatarUrl ?? null,
    isLoading: tiktokConnected && creatorInfo.isLoading,
  };
}

/**
 * Resolve a stored `targetPlatforms` value into the set of toggles to show as
 * selected. Empty (the default) means "all", so every toggle is on.
 */
export function selectedFromTargets(targetPlatforms: Platform[]): Set<Platform> {
  if (targetPlatforms.length === 0) return new Set(PLATFORM_ORDER);
  return new Set(targetPlatforms.filter((p) => platformSchema.options.includes(p)));
}

/**
 * Normalize a selection back into the stored shape. All three selected collapses
 * to `[]` ("all connected") so newly-connected platforms are picked up too.
 */
export function targetsFromSelected(selected: Set<Platform>): Platform[] {
  if (selected.size >= PLATFORM_ORDER.length) return [];
  return PLATFORM_ORDER.filter((p) => selected.has(p));
}

/**
 * A row of three toggle chips. Enforces at least one selected platform — the
 * last active chip can't be turned off (a video that posts nowhere is never the
 * intent; to stop it, remove it from the queue).
 */
export function PlatformChips({
  selected,
  connected,
  onChange,
  size = 'sm',
  disabled,
  tiktokAvatarUrl,
}: {
  selected: Set<Platform>;
  connected: Set<Platform>;
  onChange: (next: Set<Platform>) => void;
  size?: 'sm' | 'xs';
  disabled?: boolean;
  /** Connected TikTok creator's avatar, shown inside the TikTok pill (1A context). */
  tiktokAvatarUrl?: string | null;
}) {
  const toggle = (p: Platform) => {
    const next = new Set(selected);
    if (next.has(p)) {
      if (next.size === 1) return; // keep at least one
      next.delete(p);
    } else {
      next.add(p);
    }
    onChange(next);
  };

  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';

  return (
    <div className="flex flex-wrap items-center gap-1">
      {PLATFORM_ORDER.map((p) => {
        const on = selected.has(p);
        const isConnected = connected.has(p);
        const label = size === 'xs' ? SHORT_BADGE[p] : PLATFORM_SHORT[p];
        const showAvatar = p === 'TIKTOK' && isConnected && Boolean(tiktokAvatarUrl);
        const avatarSize = size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4';
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              toggle(p);
            }}
            aria-pressed={on}
            title={
              isConnected
                ? `${PLATFORM_LABELS[p]} — ${on ? 'will post here' : 'not posting here'}`
                : `${PLATFORM_LABELS[p]} isn't connected yet — it'll post once you connect it`
            }
            className={`inline-flex items-center gap-1 rounded-md border font-medium transition disabled:opacity-50 ${pad} ${
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:bg-accent'
            }`}
          >
            {showAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tiktokAvatarUrl as string}
                alt=""
                className={`-ml-0.5 shrink-0 rounded-full object-cover ${avatarSize}`}
              />
            ) : null}
            {label}
            {!isConnected ? (
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  on ? 'bg-amber-300' : 'bg-amber-400'
                }`}
                title="Not connected"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const SHORT_BADGE: Record<Platform, string> = {
  INSTAGRAM: 'IG',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YT',
};
