import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerSession } from '@/server/session';
import { AuthForm } from '@/features/auth/AuthForm';
import { MarketingPanel } from '@/features/marketing/MarketingPanel';

/**
 * /signin — the login / create-account page. Moved here off the root route so
 * the homepage can be a public marketing page. Authenticated users are sent
 * straight to /home. A `?mode=signup` query param deep-links to the sign-up tab
 * (used by the "Get started" CTAs on the marketing pages).
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await getServerSession();
  if (session?.user) redirect('/home');

  const { mode } = await searchParams;
  const initialMode = mode === 'signup' ? 'signup' : 'signin';

  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        <div className="hidden md:block">
          <Link href="/" className="mb-6 inline-flex items-center gap-2 font-semibold tracking-tight">
            <Image
              src="/postpilot-icon.png"
              alt="PostPilot"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span>PostPilot</span>
          </Link>
          <MarketingPanel />
        </div>
        <div className="flex flex-col items-center gap-6">
          <AuthForm hasGoogle={hasGoogle} initialMode={initialMode} />
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
