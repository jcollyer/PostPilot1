import { redirect } from 'next/navigation';

import { getServerSession } from '@/server/session';
import { LandingPage } from '@/features/marketing/LandingPage';

/**
 * Public marketing homepage. Authenticated users are sent straight to /home;
 * everyone else sees the feature pitch with calls to action that lead to
 * /signin and /pricing.
 */
export default async function HomePage() {
  const session = await getServerSession();
  if (session?.user) redirect('/home');

  return <LandingPage />;
}
