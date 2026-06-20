import { redirect } from 'next/navigation';

import { DashboardView } from '@/features/dashboard/DashboardView';
import { getServerSession } from '@/server/session';
import { getFirstName } from '@/lib/utils';

/**
 * /home — the dashboard: queue health, next/last post, and connection status.
 * Minimal by design (no analytics or charts).
 */
export default async function HomePage() {
  const session = await getServerSession();
  if (!session?.user) redirect('/');

  const greetingName = getFirstName(session.user.name, session.user.email);

  return <DashboardView greeting={greetingName} />;
}
