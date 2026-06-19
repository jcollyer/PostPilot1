'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2, Plug, RefreshCw, Unplug } from 'lucide-react';

import { PLATFORM_LABELS, type Platform } from '@saas/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';

interface ConnectionsViewProps {
  connected?: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "That platform isn't configured yet (missing API credentials).",
  unknown_platform: 'Unknown platform.',
  invalid_oauth_response: 'The sign-in response was missing required values. Please try again.',
  invalid_state: 'Your connect session expired. Please try again.',
  state_mismatch: 'Security check failed. Please try connecting again.',
  connect_failed: "We couldn't finish connecting that account. Please try again.",
  access_denied: 'You declined the permission request.',
};

export function ConnectionsView({ connected, error }: ConnectionsViewProps) {
  const utils = trpc.useUtils();
  const { data: overview, isLoading } = trpc.connections.overview.useQuery();

  const disconnect = trpc.connections.disconnect.useMutation({
    onSuccess: () => utils.connections.overview.invalidate(),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
      </div>

      {connected ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Connected {PLATFORM_LABELS[connected.toUpperCase() as Platform] ?? connected}.
        </div>
      ) : null}

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {ERROR_MESSAGES[error] ?? 'Something went wrong connecting that account.'}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Platforms</CardTitle>
          <CardDescription>
            Connect the accounts PostPilot will publish to. Each platform refreshes its own access
            automatically — we&apos;ll only ask you to reconnect if a connection genuinely breaks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            overview?.map((entry) => (
              <PlatformRow
                key={entry.platform}
                entry={entry}
                onDisconnect={(connectionId) => disconnect.mutate({ connectionId })}
                disconnecting={disconnect.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type OverviewEntry = NonNullable<
  ReturnType<typeof trpc.connections.overview.useQuery>['data']
>[number];

function PlatformRow({
  entry,
  onDisconnect,
  disconnecting,
}: {
  entry: OverviewEntry;
  onDisconnect: (connectionId: string) => void;
  disconnecting: boolean;
}) {
  const label = PLATFORM_LABELS[entry.platform];
  const conn = entry.connection;
  const status = conn?.status ?? (entry.configured ? 'NONE' : 'UNAVAILABLE');

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-4">
      <div className="min-w-0 space-y-1">
        <p className="font-medium leading-none">{label}</p>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {conn?.displayName || conn?.username ? (
            <span className="text-muted-foreground truncate text-xs">
              {conn.displayName ?? conn.username}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!entry.configured ? (
          <span className="text-muted-foreground text-xs">Not available</span>
        ) : status === 'NEEDS_RECONNECT' ? (
          <>
            <Button asChild size="sm">
              <a href={`/api/connections/${entry.platform.toLowerCase()}/start`}>
                <RefreshCw className="mr-1 h-4 w-4" />
                Reconnect
              </a>
            </Button>
            {conn ? (
              <DisconnectButton
                connectionId={conn.id}
                onDisconnect={onDisconnect}
                disconnecting={disconnecting}
              />
            ) : null}
          </>
        ) : conn ? (
          <DisconnectButton
            connectionId={conn.id}
            onDisconnect={onDisconnect}
            disconnecting={disconnecting}
          />
        ) : (
          <Button asChild size="sm">
            <a href={`/api/connections/${entry.platform.toLowerCase()}/start`}>
              <Plug className="mr-1 h-4 w-4" />
              Connect
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function DisconnectButton({
  connectionId,
  onDisconnect,
  disconnecting,
}: {
  connectionId: string;
  onDisconnect: (connectionId: string) => void;
  disconnecting: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onDisconnect(connectionId)}
      disabled={disconnecting}
    >
      {disconnecting ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Unplug className="mr-1 h-4 w-4" />
      )}
      Disconnect
    </Button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ACTIVE: { label: 'Connected', className: 'bg-emerald-100 text-emerald-800' },
    NEEDS_RECONNECT: { label: 'Reconnect needed', className: 'bg-red-100 text-red-800' },
    PAUSED: { label: 'Paused', className: 'bg-amber-100 text-amber-800' },
    DISCONNECTED: { label: 'Disconnected', className: 'bg-slate-100 text-slate-700' },
    NONE: { label: 'Not connected', className: 'bg-slate-100 text-slate-700' },
    UNAVAILABLE: { label: 'Unavailable', className: 'bg-slate-100 text-slate-500' },
  };
  const s = map[status] ?? map.NONE;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>
  );
}
