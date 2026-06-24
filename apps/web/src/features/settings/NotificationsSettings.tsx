'use client';

import Link from 'next/link';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc/client';

/** Human label for each delivery channel. */
const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'Email',
  PUSH: 'Push',
  SMS: 'SMS',
};

/** Where a notification should take the user when clicked. */
function hrefFor(type: string): string {
  switch (type) {
    case 'RECONNECT_REQUIRED':
      return '/settings/connections';
    default:
      return '/queue';
  }
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Delivery preference toggles, one row per alert type. */
function PreferencesPanel() {
  const utils = trpc.useUtils();
  const prefs = trpc.notifications.getPreferences.useQuery();

  const setPref = trpc.notifications.setPreferences.useMutation({
    // Optimistically flip the toggle so it feels instant, rolling back on error.
    onMutate: async ({ updates }) => {
      await utils.notifications.getPreferences.cancel();
      const prev = utils.notifications.getPreferences.getData();
      utils.notifications.getPreferences.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          types: old.types.map((t) => ({
            ...t,
            channels: t.channels.map((c) => {
              const u = updates.find((x) => x.type === t.type && x.channel === c.channel);
              return u ? { ...c, enabled: u.enabled } : c;
            }),
          })),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.notifications.getPreferences.setData(undefined, ctx.prev);
    },
    onSettled: () => utils.notifications.getPreferences.invalidate(),
  });

  if (prefs.isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
      </div>
    );
  }

  if (!prefs.data) {
    return <p className="text-muted-foreground text-sm">Couldn&apos;t load preferences.</p>;
  }

  const { types, hasPhone } = prefs.data;
  const smsUsed = types.some((t) => t.channels.some((c) => c.channel === 'SMS'));

  return (
    <div className="space-y-4">
      <div className="divide-y rounded-md border">
        {types.map((t) => (
          <div
            key={t.type}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium leading-none">{t.label}</p>
              <p className="text-muted-foreground mt-1 text-xs">{t.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {t.channels.map((c) => (
                <label key={c.channel} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{CHANNEL_LABEL[c.channel]}</span>
                  <Switch
                    checked={c.enabled}
                    disabled={setPref.isPending}
                    aria-label={`${CHANNEL_LABEL[c.channel]} for ${t.label}`}
                    onCheckedChange={(enabled) =>
                      setPref.mutate({
                        updates: [{ type: t.type, channel: c.channel, enabled }],
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        In-app notifications (the bell) are always on. These toggles control which alerts are also
        delivered by email, push, and SMS.
      </p>

      {smsUsed && !hasPhone ? (
        <p className="text-muted-foreground text-xs">
          SMS alerts need a phone number on your account before they can be delivered.
        </p>
      ) : null}
    </div>
  );
}

/** Full notification inbox with load-more, mark-read, and mark-all-read. */
function InboxPanel() {
  const utils = trpc.useUtils();
  const list = trpc.notifications.list.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (last) => last.nextCursor },
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          {items.length > 0 ? `${items.length} shown` : ''}
        </span>
        {hasUnread ? (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <Check className="h-3 w-3" /> Mark all read
          </button>
        ) : null}
      </div>

      <div className="divide-y rounded-md border">
        {list.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            You&apos;re all caught up.
          </p>
        ) : (
          items.map((n) => (
            <Link
              key={n.id}
              href={hrefFor(n.type)}
              onClick={() => {
                if (!n.readAt) markRead.mutate({ id: n.id });
              }}
              className={`hover:bg-accent block px-4 py-3 ${n.readAt ? '' : 'bg-primary/5'}`}
            >
              <div className="flex items-start gap-2">
                {!n.readAt ? (
                  <span className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                ) : (
                  <span className="mt-1.5 h-2 w-2 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{n.title}</p>
                  {n.body ? <p className="text-muted-foreground mt-0.5 text-xs">{n.body}</p> : null}
                  <p className="text-muted-foreground mt-0.5 text-[11px]">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {list.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The /settings notifications section: choose how each alert type is delivered,
 * and browse the full notification history.
 */
export function NotificationsSettings() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="text-muted-foreground h-4 w-4" />
          <h3 className="text-sm font-semibold">Delivery preferences</h3>
        </div>
        <PreferencesPanel />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">All notifications</h3>
        <InboxPanel />
      </div>
    </div>
  );
}
