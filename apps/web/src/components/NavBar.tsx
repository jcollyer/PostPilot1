'use client';

import Link from 'next/link';
import { Settings, LogOut } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils';
import { signOutAction } from '@/server/actions';
import { NotificationsBell } from '@/components/NotificationsBell';

interface NavBarProps {
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
}

/**
 * Global navigation bar. The user's avatar (their photo, or initials in a
 * circle) sits on the left and opens a dropdown with a Settings link and a
 * Sign out button.
 */
export function NavBar({ name, email, image }: NavBarProps) {
  const initials = getInitials(name ?? email);

  return (
    <header className="border-b">
      <div className="container flex h-14 items-center gap-4">
        <nav className="order-2 flex items-center gap-1 text-sm font-medium">
          <Link href="/home" className="hover:bg-accent rounded-md px-3 py-1.5">
            Home
          </Link>
          <Link href="/media" className="hover:bg-accent rounded-md px-3 py-1.5">
            Library
          </Link>
          <Link href="/queue" className="hover:bg-accent rounded-md px-3 py-1.5">
            Queue
          </Link>
        </nav>
        <div className="order-3 ml-auto">
          <NotificationsBell />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open account menu"
              className="focus-visible:ring-ring rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <span className="bg-primary/15 text-primary relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-sm font-semibold">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={name ?? email ?? 'User avatar'}
                    className="absolute inset-0 h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="w-full cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full cursor-pointer text-left">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
