'use client';

import { ChevronRight } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

/**
 * Root → current breadcrumb trail. Clicking any crumb navigates to that level.
 * The root ("Library") is always shown; deeper crumbs come from
 * `folder.breadcrumbs` for the current folder.
 */
export function FolderBreadcrumbs({
  currentFolderId,
  onNavigate,
}: {
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
}) {
  const trail = trpc.folder.breadcrumbs.useQuery(
    { folderId: currentFolderId ?? '' },
    { enabled: Boolean(currentFolderId) },
  );

  const crumbs = currentFolderId ? (trail.data ?? []) : [];

  return (
    <nav
      className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm"
      aria-label="Breadcrumb"
    >
      <Crumb label="Library" active={currentFolderId === null} onClick={() => onNavigate(null)} />
      {crumbs.map((c, i) => (
        <span key={c.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
          <Crumb label={c.name} active={i === crumbs.length - 1} onClick={() => onNavigate(c.id)} />
        </span>
      ))}
    </nav>
  );
}

function Crumb({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={cn(
        'max-w-[200px] truncate rounded px-1.5 py-0.5 transition',
        active
          ? 'text-foreground font-medium'
          : 'hover:text-foreground hover:bg-muted cursor-pointer',
      )}
    >
      {label}
    </button>
  );
}
