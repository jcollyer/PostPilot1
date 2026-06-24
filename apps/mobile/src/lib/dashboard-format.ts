/** Short date like "Jun 23". */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(d));
}

/** Date + time like "Mon, Jun 23, 9:00 AM". */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(d));
}

export const PLATFORM_LABEL: Record<string, string> = {
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram Reels',
  YOUTUBE: 'YouTube Shorts',
};

export function connectionLabel(
  configured: boolean,
  status: string | null | undefined,
): {
  text: string;
  tone: 'ok' | 'warn' | 'bad' | 'muted';
} {
  if (!configured) return { text: 'Unavailable', tone: 'muted' };
  if (status === 'ACTIVE') return { text: 'Connected', tone: 'ok' };
  if (status === 'NEEDS_RECONNECT') return { text: 'Reconnect needed', tone: 'bad' };
  if (status === 'PAUSED') return { text: 'Paused', tone: 'warn' };
  return { text: 'Not connected', tone: 'muted' };
}
