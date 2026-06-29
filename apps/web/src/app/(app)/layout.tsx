import { redirect } from 'next/navigation';

import { NavBar } from '@/components/NavBar';
import { getServerSession } from '@/server/session';

/**
 * Layout for the authenticated area (/home, /settings). Guards access — any
 * unauthenticated visitor is bounced to the login page at the root route —
 * and renders the global navigation bar above every page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user) redirect('/signin');

  return (
    <div className="flex min-h-dvh flex-col">
      <NavBar name={session.user.name} email={session.user.email} image={session.user.image} />
      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
