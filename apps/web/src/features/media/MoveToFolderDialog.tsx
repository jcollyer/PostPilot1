'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc/client';
import { FolderTree } from './FolderTree';

/**
 * Pick a destination folder for the given videos (root = "Library"). Reuses the
 * lazy folder tree as a picker. On success, calls `onMoved`.
 */
export function MoveToFolderDialog({
  open,
  onOpenChange,
  videoIds,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoIds: string[];
  onMoved: () => void;
}) {
  const [dest, setDest] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const move = trpc.media.moveMany.useMutation({
    onSuccess: () => {
      void utils.media.list.invalidate();
      void utils.folder.list.invalidate();
      void utils.folder.children.invalidate();
      onOpenChange(false);
      onMoved();
    },
  });

  useEffect(() => {
    if (open) {
      setDest(null);
      move.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const count = videoIds.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !move.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Move {count} item{count === 1 ? '' : 's'} to…
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border p-2">
          <FolderTree currentFolderId={dest} onSelect={setDest} />
        </div>
        {move.error ? <p className="text-destructive text-sm">{move.error.message}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={move.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => move.mutate({ videoIds, folderId: dest })}
            disabled={move.isPending || count === 0}
          >
            {move.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Move here
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
