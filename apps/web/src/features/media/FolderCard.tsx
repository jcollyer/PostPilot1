'use client';

import { Folder as FolderIcon, FolderInput, MoreVertical, Pencil, Trash2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FolderDto } from './types';

/**
 * A folder tile in the library grid. Double-click (or the menu's Open) navigates
 * into it; the menu also exposes rename and delete, handled by the parent.
 */
export function FolderCard({
  folder,
  onOpen,
  onRename,
  onDelete,
}: {
  folder: FolderDto;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const count = folder.itemCount + folder.childFolderCount;

  return (
    <div
      role="button"
      tabIndex={0}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
        }
      }}
      title={folder.name}
      className="bg-card hover:border-foreground/20 hover:bg-muted/40 group relative flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition"
    >
      <FolderIcon className="h-9 w-9 shrink-0 fill-sky-100 text-sky-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{folder.name}</p>
        <p className="text-muted-foreground text-[11px]">
          {count === 0 ? 'Empty' : `${count} item${count === 1 ? '' : 's'}`}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Folder actions"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onOpen} className="cursor-pointer">
            <FolderInput className="mr-2 h-4 w-4" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename} className="cursor-pointer">
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive cursor-pointer"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
