import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { MediaLibraryView } from '@/features/media/MediaLibraryView';
import { getServerSession } from '@/server/session';

/**
 * /media — the Media Library. Upload videos direct-to-storage, then search,
 * filter, preview, and edit their metadata.
 */
export default async function MediaPage() {
  const session = await getServerSession();
  if (!session?.user) redirect('/signin');

  // MediaLibraryView reads the current folder from `?folder=` via
  // useSearchParams, which Next.js requires to be wrapped in Suspense.
  return (
    <Suspense fallback={null}>
      <MediaLibraryView />
    </Suspense>
  );
}
