import { redirect } from 'next/navigation';

import { getServerSession } from '@/server/session';
import { AuthForm } from '@/features/auth/AuthForm';
import { MarketingPanel } from '@/features/marketing/MarketingPanel';

/**
 * The landing/login page on the root route. Authenticated users are sent
 * straight to /home; everyone else sees the brand pitch + pricing alongside the
 * sign-in / create-account card.
 */
export default async function LoginPage() {
  const session = await getServerSession();
  if (session?.user) redirect('/home');

  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        <div className="hidden md:block">
          <MarketingPanel />
        </div>
        <div className="flex justify-center">
          <AuthForm hasGoogle={hasGoogle} />
        </div>
      </div>
    </main>
  );
}
