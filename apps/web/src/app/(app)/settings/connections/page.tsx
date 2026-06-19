import { ConnectionsView } from '@/features/connections/ConnectionsView';

/**
 * /settings/connections — connect, reconnect, and disconnect TikTok,
 * Instagram, and YouTube, with per-platform health.
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  return <ConnectionsView connected={connected} error={error} />;
}
