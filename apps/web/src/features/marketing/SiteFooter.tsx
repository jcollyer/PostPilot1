import Link from 'next/link';

/**
 * Minimal footer for the public marketing pages.
 */
export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm sm:flex-row">
        <p>© {new Date().getFullYear()} PostPilot. All rights reserved.</p>
        <nav className="flex items-center gap-4">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/signin" className="hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
