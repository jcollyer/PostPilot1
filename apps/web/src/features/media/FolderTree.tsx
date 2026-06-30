'use client';

import { useState } from 'react';
import { ChevronRight, Folder as FolderIcon, FolderOpen, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import type { FolderDto } from './types';

/**
 * Left-side folder tree. Lazy: each node fetches its child folders only when
 * it's expanded, so the panel stays cheap no matter how big the library gets.
 * Selecting a node navigates the main pane to that folder.
 */
export function FolderTree({
  currentFolderId,
  onSelect,
}: {
  currentFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  const roots = trpc.folder.children.useQuery({ parentId: null });

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition',
          currentFolderId === null
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-sky-500" />
        <span className="truncate">Library</span>
      </button>

      <div className="mt-0.5">
        {roots.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : (
          (roots.data ?? []).map((f) => (
            <TreeNode
              key={f.id}
              folder={f}
              depth={0}
              currentFolderId={currentFolderId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TreeNode({
  folder,
  depth,
  currentFolderId,
  onSelect,
}: {
  folder: FolderDto;
  depth: number;
  currentFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = folder.childFolderCount > 0;
  const active = folder.id === currentFolderId;

  const children = trpc.folder.children.useQuery(
    { parentId: folder.id },
    { enabled: expanded && hasChildren },
  );

  return (
    <div>
      <div
        className={cn(
          'group flex items-center rounded-md transition',
          active ? 'bg-muted text-foreground font-medium' : 'hover:bg-muted/60',
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={() => hasChildren && setExpanded((v) => !v)}
          className={cn(
            'flex h-7 w-5 shrink-0 items-center justify-center',
            hasChildren ? 'text-muted-foreground' : 'invisible',
          )}
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-90')} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-sky-500" />
          ) : (
            <FolderIcon className="h-4 w-4 shrink-0 text-sky-500" />
          )}
          <span className="truncate">{folder.name}</span>
        </button>
      </div>

      {expanded && hasChildren ? (
        <div>
          {children.isLoading ? (
            <div
              className="text-muted-foreground flex items-center gap-2 py-1 text-xs"
              style={{ paddingLeft: (depth + 1) * 12 + 20 }}
            >
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : (
            (children.data ?? []).map((c) => (
              <TreeNode
                key={c.id}
                folder={c}
                depth={depth + 1}
                currentFolderId={currentFolderId}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
