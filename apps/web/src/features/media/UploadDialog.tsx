'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Upload, X, AlertCircle } from 'lucide-react';

import { ACCEPTED_VIDEO_MIME_TYPES, MAX_VIDEO_BYTES } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc/client';
import { formatBytes, uploadParts } from './upload';

type ItemStatus = 'uploading' | 'done' | 'error' | 'canceled';

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: ItemStatus;
  error?: string;
  controller: AbortController;
}

const ACCEPT = ACCEPTED_VIDEO_MIME_TYPES.join(',');

export function UploadDialog({
  onUploaded,
  folderId = null,
}: {
  onUploaded: () => void;
  /** Folder new uploads land in (null = the root). */
  folderId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const initUpload = trpc.media.initUpload.useMutation();
  const completeUpload = trpc.media.completeUpload.useMutation();
  const abortUpload = trpc.media.abortUpload.useMutation();

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  const runUpload = useCallback(
    async (item: UploadItem) => {
      try {
        const init = await initUpload.mutateAsync({
          filename: item.file.name,
          contentType: item.file.type as (typeof ACCEPTED_VIDEO_MIME_TYPES)[number],
          fileSize: item.file.size,
          folderId,
        });

        const parts = await uploadParts({
          file: item.file,
          parts: init.parts,
          partSize: init.partSize,
          signal: item.controller.signal,
          onProgress: (fraction) => patch(item.id, { progress: fraction }),
        });

        await completeUpload.mutateAsync({
          videoId: init.videoId,
          uploadId: init.uploadId,
          parts,
        });

        patch(item.id, { status: 'done', progress: 1 });
        onUploaded();

        // Best-effort cleanup if the user cancelled mid-finalize.
        if (item.controller.signal.aborted) {
          abortUpload.mutate({ videoId: init.videoId, uploadId: init.uploadId });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          patch(item.id, { status: 'canceled' });
        } else {
          patch(item.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Upload failed',
          });
        }
      }
    },
    [abortUpload, completeUpload, initUpload, onUploaded, patch, folderId],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const valid = Array.from(files).filter(
        (f) =>
          (ACCEPTED_VIDEO_MIME_TYPES as readonly string[]).includes(f.type) &&
          f.size <= MAX_VIDEO_BYTES,
      );
      const newItems: UploadItem[] = valid.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        progress: 0,
        status: 'uploading',
        controller: new AbortController(),
      }));
      setItems((prev) => [...newItems, ...prev]);
      newItems.forEach(runUpload);
    },
    [runUpload],
  );

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const inProgress = items.some((it) => it.status === 'uploading');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the dialog close out from under an active upload.
        if (!next && inProgress) return;
        setOpen(next);
        if (!next) setItems([]);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload videos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload videos</DialogTitle>
          <DialogDescription>
            Drop a batch of videos here — they upload straight to storage. You can keep working;
            we&apos;ll process them in the background.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
        >
          <Upload className="text-muted-foreground h-6 w-6" />
          <span className="font-medium">Drop videos or click to browse</span>
          <span className="text-muted-foreground text-xs">
            MP4, MOV, or WebM · up to 10 GB each
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={onSelect}
        />

        {items.length > 0 ? (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {items.map((it) => (
              <li key={it.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {it.file.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatBytes(it.file.size)}
                  </span>
                  <UploadStatusIcon item={it} onCancel={() => it.controller.abort()} />
                </div>
                {it.status === 'uploading' ? (
                  <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full transition-[width]"
                      style={{ width: `${Math.round(it.progress * 100)}%` }}
                    />
                  </div>
                ) : null}
                {it.status === 'error' ? (
                  <p className="text-destructive mt-1 text-xs">{it.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UploadStatusIcon({ item, onCancel }: { item: UploadItem; onCancel: () => void }) {
  if (item.status === 'done') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (item.status === 'error') return <AlertCircle className="text-destructive h-4 w-4 shrink-0" />;
  if (item.status === 'canceled')
    return <span className="text-muted-foreground shrink-0 text-xs">Canceled</span>;
  return (
    <button
      type="button"
      onClick={onCancel}
      aria-label="Cancel upload"
      className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
