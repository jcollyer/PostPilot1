import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compute up to two uppercase initials from a name or email. Falls back to "?". */
export function getInitials(value: string | null | undefined): string {
  return (
    (value ?? '?')
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

/** Friendly greeting name from a display name or, failing that, an email. */
export function getGreetingName(name: string | null | undefined, email: string | null | undefined) {
  const fromName = name?.trim();
  if (fromName) return fromName;
  return email ?? 'there';
}
