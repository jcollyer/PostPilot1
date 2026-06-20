'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Film,
  Layers,
  Loader2,
  Pause,
} from 'lucide-react';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(d));
}
function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(d));
}

export function DashboardView({ greeting }: { greeting: string }) {
  const { data, isLoading } = trpc.dashboard.overview.useQuery();

  if (isLoading || !data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-20 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your dashboard…
      </div>
    );
  }

  const { health } = data;
  const paused = data.queueStatus === 'PAUSED';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Hello {greeting}</h1>
        {paused ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            <Pause className="h-3 w-3" /> Queue paused
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Queue active
          </span>
        )}
      </div>

      {/* Queue health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Queue health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Videos remaining" value={String(health.remaining)} />
            <Stat
              label="Days of content"
              value={health.daysRemaining != null ? `≈ ${Math.round(health.daysRemaining)}` : '—'}
            />
            <Stat label="Estimated empty" value={fmtDate(health.estimatedEmptyDate)} />
            <Stat label="Upload by" value={fmtDate(health.recommendedUploadBy)} />
          </div>
          {health.postsPerDay <= 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              Add a <Link href="/queue" className="underline">posting schedule</Link> so PostPilot
              can project how long your content lasts.
            </p>
          ) : health.remaining === 0 ? (
            <p className="mt-4 text-sm text-amber-700">
              Your queue is empty.{' '}
              <Link href="/media" className="underline">Upload more videos</Link> to keep posting.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Next / Last / Library */}
      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard icon={<CalendarClock className="h-4 w-4" />} title="Next scheduled post">
          {data.nextPost ? (
            <PostRow
              thumbnailUrl={data.nextPost.thumbnailUrl}
              title={data.nextPost.title}
              platform={data.nextPost.platform}
              sub={fmtDateTime(data.nextPost.scheduledAt)}
            />
          ) : (
            <Empty text="Nothing scheduled yet" />
          )}
        </InfoCard>

        <InfoCard icon={<Clock className="h-4 w-4" />} title="Last published">
          {data.lastPublished ? (
            <PostRow
              thumbnailUrl={data.lastPublished.thumbnailUrl}
              title={data.lastPublished.title}
              platform={data.lastPublished.platform}
              sub={fmtDateTime(data.lastPublished.publishedAt)}
              href={data.lastPublished.postUrl}
            />
          ) : (
            <Empty text="Nothing published yet" />
          )}
        </InfoCard>

        <InfoCard icon={<Layers className="h-4 w-4" />} title="Ready in library">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">{data.readyVideos}</span>
            <Link href="/media" className="text-primary text-sm underline">
              Open library
            </Link>
          </div>
        </InfoCard>
      </div>

      {/* Connections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Connected accounts
            <Link href="/settings/connections" className="text-muted-foreground text-sm font-normal underline">
              Manage
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.connections.map((c) => (
            <div key={c.platform} className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{PLATFORM_LABELS[c.platform as Platform]}</span>
              <ConnHealth configured={c.configured} status={c.connection?.status ?? null} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PostRow({
  thumbnailUrl,
  title,
  platform,
  sub,
  href,
}: {
  thumbnailUrl: string | null;
  title: string | null;
  platform: Platform;
  sub: string;
  href?: string | null;
}) {
  const body = (
    <div className="flex items-center gap-2">
      <div className="bg-muted flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Film className="text-muted-foreground h-4 w-4" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title ?? 'Untitled'}</p>
        <p className="text-muted-foreground text-xs">
          {PLATFORM_LABELS[platform]} · {sub}
          {href ? <ExternalLink className="ml-1 inline h-3 w-3" /> : null}
        </p>
      </div>
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
      {body}
    </a>
  ) : (
    body
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-muted-foreground text-sm">{text}</p>;
}

function ConnHealth({ configured, status }: { configured: boolean; status: string | null }) {
  if (!configured) {
    return <Badge className="bg-slate-100 text-slate-500">Unavailable</Badge>;
  }
  if (status === 'ACTIVE') return <Badge className="bg-emerald-100 text-emerald-800">Connected</Badge>;
  if (status === 'NEEDS_RECONNECT')
    return (
      <Link href="/settings/connections">
        <Badge className="bg-red-100 text-red-800">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          Reconnect
        </Badge>
      </Link>
    );
  if (status === 'PAUSED') return <Badge className="bg-amber-100 text-amber-800">Paused</Badge>;
  return <Badge className="bg-slate-100 text-slate-700">Not connected</Badge>;
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className ?? ''}`}>{children}</span>
  );
}
