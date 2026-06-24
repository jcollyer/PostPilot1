import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Card } from '../../src/components/Card';
import { trpc } from '../../src/lib/trpc';
import { getFirstName } from '../../src/lib/format';
import {
  connectionLabel,
  fmtDate,
  fmtDateTime,
  PLATFORM_LABEL,
} from '../../src/lib/dashboard-format';

/**
 * Mobile home = read-only monitor. Mirrors the web dashboard: queue health,
 * next/last post, and connection status. Heavier management lives in the web
 * app; this screen is for checking in at a glance.
 */
export default function HomeScreen() {
  const me = trpc.user.me.useQuery();
  const overview = trpc.dashboard.overview.useQuery();

  if (overview.isLoading && !overview.data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  const d = overview.data;
  const greeting = getFirstName(me.data?.name, me.data?.email);

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={
        <RefreshControl refreshing={overview.isFetching} onRefresh={() => overview.refetch()} />
      }
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-semibold text-slate-900">Hello {greeting}</Text>
        <Text
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            d?.queueStatus === 'PAUSED'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {d?.queueStatus === 'PAUSED' ? 'Paused' : 'Active'}
        </Text>
      </View>

      {/* Queue health */}
      <Card className="p-4">
        <Text className="mb-3 text-sm font-semibold text-slate-900">Queue health</Text>
        <View className="flex-row flex-wrap">
          <Stat label="Videos left" value={String(d?.health.remaining ?? 0)} />
          <Stat
            label="Days of content"
            value={
              d?.health.daysRemaining != null ? `≈ ${Math.round(d.health.daysRemaining)}` : '—'
            }
          />
          <Stat label="Empty ~" value={fmtDate(d?.health.estimatedEmptyDate)} />
          <Stat label="Upload by" value={fmtDate(d?.health.recommendedUploadBy)} />
        </View>
        {d && d.health.postsPerDay <= 0 ? (
          <Text className="mt-3 text-xs text-slate-500">
            Add a posting schedule in the web app to project coverage.
          </Text>
        ) : d && d.health.remaining === 0 ? (
          <Text className="mt-3 text-xs text-amber-700">
            Your queue is empty — upload more videos to keep posting.
          </Text>
        ) : null}
      </Card>

      {/* Next / Last */}
      <Card className="p-4">
        <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Next scheduled post
        </Text>
        {d?.nextPost ? (
          <PostRow
            title={d.nextPost.title}
            sub={`${PLATFORM_LABEL[d.nextPost.platform]} · ${fmtDateTime(d.nextPost.scheduledAt)}`}
          />
        ) : (
          <Text className="text-sm text-slate-500">Nothing scheduled yet</Text>
        )}
      </Card>

      <Card className="p-4">
        <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Last published
        </Text>
        {d?.lastPublished ? (
          <PostRow
            title={d.lastPublished.title}
            sub={`${PLATFORM_LABEL[d.lastPublished.platform]} · ${fmtDateTime(d.lastPublished.publishedAt)}`}
          />
        ) : (
          <Text className="text-sm text-slate-500">Nothing published yet</Text>
        )}
      </Card>

      {/* Connections */}
      <Card className="p-4">
        <Text className="mb-2 text-sm font-semibold text-slate-900">Connected accounts</Text>
        <View className="gap-2">
          {d?.connections.map((c) => {
            const badge = connectionLabel(c.configured, c.connection?.status);
            return (
              <View key={c.platform} className="flex-row items-center justify-between">
                <Text className="text-sm text-slate-700">{PLATFORM_LABEL[c.platform]}</Text>
                <Text className={`text-xs font-medium ${toneClass(badge.tone)}`}>{badge.text}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Text className="text-center text-xs text-slate-400">
        Manage your queue and schedule in the PostPilot web app.
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-2 w-1/2">
      <Text className="text-xl font-semibold text-slate-900">{value}</Text>
      <Text className="text-xs text-slate-500">{label}</Text>
    </View>
  );
}

function PostRow({ title, sub }: { title: string | null; sub: string }) {
  return (
    <View>
      <Text className="text-sm font-medium text-slate-900">{title ?? 'Untitled'}</Text>
      <Text className="text-xs text-slate-500">{sub}</Text>
    </View>
  );
}

function toneClass(tone: 'ok' | 'warn' | 'bad' | 'muted'): string {
  switch (tone) {
    case 'ok':
      return 'text-emerald-700';
    case 'warn':
      return 'text-amber-700';
    case 'bad':
      return 'text-red-700';
    default:
      return 'text-slate-400';
  }
}
