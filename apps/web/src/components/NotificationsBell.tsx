'use client';

import Link from 'next/link';
import { Bell, Check, Loader2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc/client';

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

export function NotificationsBell() {
  const utils = trpc.useUtils();
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 30_000 });
  const list = trpc.notifications.list.useQuery({ limit: 15 });

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

  const count = unread.data ?? 0;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) list.refetch();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="hover:bg-accent relative rounded-full p-2"
        >
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="bg-destructive absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {count > 0 ? (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {list.isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">You&apos;re all caught up.</p>
          ) : (
            list.data!.items.map((n) => (
              <Link
                key={n.id}
                href={hrefFor(n.type)}
                onClick={() => {
                  if (!n.readAt) markRead.mutate({ id: n.id });
                }}
                className={`hover:bg-accent block border-b px-3 py-2.5 last:border-b-0 ${
                  n.readAt ? '' : 'bg-primary/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.readAt ? (
                    <span className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                  ) : (
                    <span className="mt-1.5 h-2 w-2 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.body ? (
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{n.body}</p>
                    ) : null}
                    <p className="text-muted-foreground mt-0.5 text-[11px]">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
