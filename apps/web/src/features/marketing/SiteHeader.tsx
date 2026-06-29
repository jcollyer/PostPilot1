import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Top navigation shown on the public marketing pages (home + pricing). Logo on
 * the left links home; pricing + sign-in links on the right.
 */
export function SiteHeader() {
  return (
    <header className="border-border/60 sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Image
            src="/postpilot-icon.png"
            alt="PostPilot"
            width={28}
            height={28}
            className="rounded-md"
          />
          <span>PostPilot</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/pricing">Pricing</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signin?mode=signup">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
