'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import type { FolderDto } from './types';

/** Rename a folder. `folder` null = closed. */
export function RenameFolderDialog({
  folder,
  onOpenChange,
  onRenamed,
}: {
  folder: FolderDto | null;
  onOpenChange: (open: boolean) => void;
  onRenamed?: () => void;
}) {
  const [name, setName] = useState('');
  const utils = trpc.useUtils();

  const rename = trpc.folder.rename.useMutation({
    onSuccess: () => {
      void utils.folder.list.invalidate();
      void utils.folder.children.invalidate();
      void utils.folder.breadcrumbs.invalidate();
      onOpenChange(false);
      onRenamed?.();
    },
  });

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      rename.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  const trimmed = name.trim();
  const unchanged = trimmed === folder?.name;
  const submit = () => {
    if (!folder || !trimmed || unchanged || rename.isPending) return;
    rename.mutate({ folderId: folder.id, name: trimmed });
  };

  return (
    <Dialog open={Boolean(folder)} onOpenChange={(o) => !rename.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Folder name"
            maxLength={120}
          />
          {rename.error ? <p className="text-destructive text-sm">{rename.error.message}</p> : null}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rename.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!trimmed || unchanged || rename.isPending}>
            {rename.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
