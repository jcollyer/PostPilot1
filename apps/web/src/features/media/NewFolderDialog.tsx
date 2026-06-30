'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import type { FolderDto } from './types';

/**
 * Modal to create a folder in `parentId` (null = root). On success it calls
 * `onCreated` with the new folder so the caller can navigate straight into it.
 */
export function NewFolderDialog({
  open,
  onOpenChange,
  parentId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
  onCreated: (folder: FolderDto) => void;
}) {
  const [name, setName] = useState('');
  const utils = trpc.useUtils();

  const create = trpc.folder.create.useMutation({
    onSuccess: (folder) => {
      void utils.folder.list.invalidate();
      void utils.folder.children.invalidate();
      onOpenChange(false);
      onCreated(folder);
    },
  });

  // Reset the field and any error each time the dialog opens.
  useEffect(() => {
    if (open) {
      setName('');
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed || create.isPending) return;
    create.mutate({ name: trimmed, parentId });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
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
          {create.error ? <p className="text-destructive text-sm">{create.error.message}</p> : null}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!trimmed || create.isPending}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
