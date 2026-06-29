import { redirect } from 'next/navigation';

import { QueueView } from '@/features/queue/QueueView';
import { getServerSession } from '@/server/session';

/**
 * /queue — the heart of PostPilot. Reorder the queue, set recurring schedules,
 * smart-arrange to space similar content apart, and see upcoming posts.
 */
export default async function QueuePage() {
  const session = await getServerSession();
  if (!session?.user) redirect('/signin');

  return <QueueView />;
}
