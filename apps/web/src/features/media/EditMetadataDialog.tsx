'use client';

import { useEffect, useState } from 'react';
import { Check, ImagePlus, Loader2, Sparkles } from 'lucide-react';

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  MAX_COVER_BYTES,
  PLATFORM_LABELS,
  platformSchema,
  type Platform,
} from '@postpilot/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc/client';
import type { VideoDto } from './types';
import { putObject } from './upload';

const IMAGE_ACCEPT = ACCEPTED_IMAGE_MIME_TYPES.join(',');

export function EditMetadataDialog({
  video,
  open,
  onOpenChange,
  onSaved,
}: {
  video: VideoDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(video.title ?? '');
  const [caption, setCaption] = useState(video.caption ?? '');
  const [hashtags, setHashtags] = useState((video.hashtags ?? []).join(' '));
  const [categoryId, setCategoryId] = useState(video.categoryId ?? '');
  const [coverUrl, setCoverUrl] = useState(video.coverImageUrl ?? null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const categories = trpc.media.listCategories.useQuery();
  const detail = trpc.media.get.useQuery({ videoId: video.id }, { enabled: open });
  const updateMetadata = trpc.media.updateMetadata.useMutation();
  const initCoverUpload = trpc.media.initCoverUpload.useMutation();
  const confirmCoverUpload = trpc.media.confirmCoverUpload.useMutation();
  const selectThumbnail = trpc.media.selectThumbnail.useMutation({
    onSuccess: () => {
      detail.refetch();
      onSaved();
    },
  });

  const parseHashtags = (raw: string) =>
    raw
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);

  const save = async () => {
    await updateMetadata.mutateAsync({
      videoId: video.id,
      title: title.trim() || null,
      caption: caption.trim() || null,
      hashtags: parseHashtags(hashtags),
      categoryId: categoryId || null,
    });
    onSaved();
    onOpenChange(false);
  };

  const onCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverError(null);
    if (!(ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      setCoverError('Use a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setCoverError('That image is too large (15 MB max).');
      return;
    }
    setCoverBusy(true);
    try {
      const { url } = await initCoverUpload.mutateAsync({
        videoId: video.id,
        contentType: file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number],
        fileSize: file.size,
      });
      await putObject(url, file);
      const updated = await confirmCoverUpload.mutateAsync({ videoId: video.id });
      setCoverUrl(updated.coverImageUrl ?? null);
      onSaved();
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Cover upload failed.');
    } finally {
      setCoverBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            Base title, caption, and hashtags. Per-platform variants come from the AI pipeline and
            can be tuned per platform later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="video-title">Title</Label>
            <Input
              id="video-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this video a title"
              maxLength={150}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="video-caption">Caption</Label>
            <textarea
              id="video-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption…"
              rows={4}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="video-hashtags">Hashtags</Label>
            <Input
              id="video-hashtags"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="travel drone sunset"
            />
            <p className="text-muted-foreground text-xs">Separate with spaces or commas.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="video-category">Category</Label>
            <select
              id="video-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <option value="">No category</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Cover image</Label>
            <div className="flex items-center gap-3">
              <div className="bg-muted flex h-20 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="text-muted-foreground h-5 w-5" />
                )}
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={onCoverSelect}
                  disabled={coverBusy}
                />
                <span className="border-input hover:bg-accent inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">
                  {coverBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 h-4 w-4" />
                  )}
                  {coverUrl ? 'Replace cover' : 'Add cover'}
                </span>
              </label>
            </div>
            {coverError ? <p className="text-destructive text-xs">{coverError}</p> : null}
            <p className="text-muted-foreground text-xs">
              No cover? The AI-selected thumbnail below is used automatically.
            </p>
          </div>

          {detail.data && detail.data.thumbnails.length > 0 ? (
            <div className="space-y-1.5">
              <Label>AI thumbnail suggestions</Label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {detail.data.thumbnails.map((t) => {
                  const selected = t.id === detail.data?.selectedThumbnailId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        selectThumbnail.mutate({ videoId: video.id, thumbnailId: t.id })
                      }
                      disabled={selectThumbnail.isPending}
                      className={`relative h-24 w-14 shrink-0 overflow-hidden rounded-md border-2 ${
                        selected
                          ? 'border-primary'
                          : 'hover:border-muted-foreground/40 border-transparent'
                      }`}
                    >
                      {t.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.url} alt="Frame" className="h-full w-full object-cover" />
                      ) : null}
                      {selected ? (
                        <span className="bg-primary absolute bottom-0.5 right-0.5 rounded-full p-0.5 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {detail.data ? (
            <div className="space-y-1.5">
              <Label>Per-platform captions</Label>
              <p className="text-muted-foreground text-xs">
                AI tailors each platform. Edits here are kept and won&apos;t be overwritten on
                re-generate.
              </p>
              <PlatformMetaEditor
                videoId={video.id}
                meta={detail.data.platformMeta}
                onSaved={() => {
                  detail.refetch();
                  onSaved();
                }}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMetadata.isPending}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={updateMetadata.isPending}>
            {updateMetadata.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PlatformMetaRow {
  platform: Platform;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  aiGenerated: boolean;
  edited: boolean;
}

function PlatformMetaEditor({
  videoId,
  meta,
  onSaved,
}: {
  videoId: string;
  meta: PlatformMetaRow[];
  onSaved: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>(platformSchema.options[0]);
  const current = meta.find((m) => m.platform === platform);

  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');

  // Reload the fields whenever the selected platform (or its data) changes.
  useEffect(() => {
    setTitle(current?.title ?? '');
    setCaption(current?.caption ?? '');
    setHashtags((current?.hashtags ?? []).join(' '));
  }, [platform, current?.title, current?.caption, current?.hashtags]);

  const setPlatformMeta = trpc.media.setPlatformMeta.useMutation({ onSuccess: onSaved });

  const save = () =>
    setPlatformMeta.mutate({
      videoId,
      platform,
      title: title.trim() || null,
      caption: caption.trim() || null,
      hashtags: hashtags
        .split(/[\s,]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean),
    });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center gap-1">
        {platformSchema.options.map((p) => {
          const row = meta.find((m) => m.platform === p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                p === platform ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              {PLATFORM_LABELS[p]}
              {row?.edited ? (
                <span title="Edited by you">✎</span>
              ) : row?.aiGenerated ? (
                <Sparkles className="h-3 w-3" />
              ) : null}
            </button>
          );
        })}
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`${PLATFORM_LABELS[platform]} title`}
      />
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={3}
        placeholder={`${PLATFORM_LABELS[platform]} caption`}
        className="border-input bg-background focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      />
      <Input
        value={hashtags}
        onChange={(e) => setHashtags(e.target.value)}
        placeholder="hashtags (space separated)"
      />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={save} disabled={setPlatformMeta.isPending}>
          {setPlatformMeta.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save {PLATFORM_LABELS[platform]}
        </Button>
      </div>
    </div>
  );
}
