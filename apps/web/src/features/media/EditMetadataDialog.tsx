'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Info, Loader2, Sparkles, TriangleAlert, UserRound } from 'lucide-react';

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  DEFAULT_TIKTOK_OPTIONS,
  evaluateTikTokRequirements,
  MAX_COVER_BYTES,
  PLATFORM_LABELS,
  platformSchema,
  TIKTOK_PRIVACY_LABELS,
  TIKTOK_PRIVACY_LEVELS,
  tiktokConsentDeclaration,
  tiktokContentLabel,
  type Platform,
  type TikTokPostOptions,
  type TikTokPrivacyLevel,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc/client';
import {
  PlatformChips,
  selectedFromTargets,
  targetsFromSelected,
  useConnectedPlatforms,
} from './PlatformTargets';
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

  const { connected } = useConnectedPlatforms();
  const [targetSel, setTargetSel] = useState(() => selectedFromTargets(video.targetPlatforms));
  const setTargetPlatforms = trpc.media.setTargetPlatforms.useMutation({ onSuccess: onSaved });
  const onToggleTargets = (next: Set<Platform>) => {
    setTargetSel(next);
    setTargetPlatforms.mutate({ videoId: video.id, platforms: targetsFromSelected(next) });
  };

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
            <Select
              value={categoryId || 'none'}
              onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="video-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Post to</Label>
            <PlatformChips selected={targetSel} connected={connected} onChange={onToggleTargets} />
            <p className="text-muted-foreground text-xs">
              Choose which platforms this video publishes to. Unconnected platforms are marked —
              they’ll post once connected.
            </p>
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
            <div className="space-y-4">
              <Label>Per-platform data</Label>

              {/* Captions subsection */}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Captions</p>
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

              {/* TikTok posting requirements subsection */}
              <TikTokRequirementsEditor
                videoId={video.id}
                connected={detail.data.tiktokConnected}
                initial={detail.data.tiktok}
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

/** A small labelled checkbox row used by the TikTok requirements editor. */
function CheckRow({
  label,
  description,
  checked,
  disabled,
  disabledHint,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      title={disabled ? disabledHint : undefined}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {description ? (
          <span className="text-muted-foreground block text-xs">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * TikTok Direct Post requirements. Auto-fills everything it safely can; the one
 * field TikTok forbids defaulting — privacy — is left blank so the user must
 * pick it. Mirrors TikTok's UX guidelines: live creator_info, no default
 * privacy, interactions off by default (greyed when disabled in-app),
 * commercial-content disclosure with brand/branded options, and a consent
 * declaration whose wording follows the selections.
 */
function TikTokRequirementsEditor({
  videoId,
  connected,
  initial,
  onSaved,
}: {
  videoId: string;
  connected: boolean;
  initial: TikTokPostOptions;
  onSaved: () => void;
}) {
  const base = initial ?? DEFAULT_TIKTOK_OPTIONS;
  const [privacy, setPrivacy] = useState<TikTokPrivacyLevel | ''>(base.privacy ?? '');
  const [allowComment, setAllowComment] = useState(base.allowComment);
  const [allowDuet, setAllowDuet] = useState(base.allowDuet);
  const [allowStitch, setAllowStitch] = useState(base.allowStitch);
  const [commercial, setCommercial] = useState(base.commercialDisclosure);
  const [brandOrganic, setBrandOrganic] = useState(base.brandOrganic);
  const [brandedContent, setBrandedContent] = useState(base.brandedContent);

  // Latest creator info (privacy options + which interactions are disabled).
  const creatorInfo = trpc.connections.tiktokCreatorInfo.useQuery(undefined, {
    enabled: connected,
  });
  const ci = creatorInfo.data;
  const live = ci?.available ? ci.info : null;
  const creatorNickname = live?.creatorNickname ?? null;
  const creatorUsername = live?.creatorUsername ?? null;
  const creatorAvatarUrl = live?.creatorAvatarUrl ?? null;

  const knownLevels = TIKTOK_PRIVACY_LEVELS as readonly string[];
  const liveOptions = (live?.privacyLevelOptions ?? []).filter((o) =>
    knownLevels.includes(o),
  ) as TikTokPrivacyLevel[];
  const privacyOptions: TikTokPrivacyLevel[] =
    liveOptions.length > 0 ? liveOptions : [...TIKTOK_PRIVACY_LEVELS];

  const commentDisabled = live?.commentDisabled ?? false;
  const duetDisabled = live?.duetDisabled ?? false;
  const stitchDisabled = live?.stitchDisabled ?? false;

  // Branded content can't be private — disable SELF_ONLY and clear it if chosen.
  const brandedActive = commercial && brandedContent;
  useEffect(() => {
    if (brandedActive && privacy === 'SELF_ONLY') setPrivacy('');
  }, [brandedActive, privacy]);

  // Effective (saved) values: never enable an interaction TikTok has disabled,
  // and never carry brand flags while disclosure is off.
  const effective: TikTokPostOptions = {
    privacy: privacy || null,
    allowComment: allowComment && !commentDisabled,
    allowDuet: allowDuet && !duetDisabled,
    allowStitch: allowStitch && !stitchDisabled,
    commercialDisclosure: commercial,
    brandOrganic: commercial && brandOrganic,
    brandedContent: commercial && brandedContent,
  };

  const reasons = evaluateTikTokRequirements(effective);
  const consent = tiktokConsentDeclaration(effective);
  const contentLabel = tiktokContentLabel(effective);
  const commercialNeedsChoice = commercial && !brandOrganic && !brandedContent;
  // Privacy is the one field with no valid default — when TikTok is connected it
  // must be chosen before the video can be added to the queue.
  const privacyMissing = connected && !privacy;

  const setTiktokMeta = trpc.media.setTiktokMeta.useMutation({ onSuccess: onSaved });

  // Auto-save on change (debounced). Skip the first render so simply opening
  // the editor doesn't mark the row edited before the user touches anything.
  const firstRun = useRef(true);
  const effectiveKey = JSON.stringify(effective);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => setTiktokMeta.mutate({ videoId, ...effective }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey, videoId]);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">{PLATFORM_LABELS.TIKTOK} requirements</p>

      {/* 1A: clearly show which TikTok account this will post to. */}
      {connected ? (
        <div className="flex items-center gap-2.5 rounded-md border bg-muted/40 p-2.5">
          {creatorAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creatorAvatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
              <UserRound className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
              Posting to TikTok as
            </p>
            {creatorNickname ? (
              <p className="truncate text-sm font-semibold leading-tight">
                {creatorNickname}
                {creatorUsername ? (
                  <span className="text-muted-foreground ml-1 font-normal">@{creatorUsername}</span>
                ) : null}
              </p>
            ) : creatorInfo.isLoading ? (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm leading-tight">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading account…
              </p>
            ) : (
              <p className="text-muted-foreground text-sm leading-tight">
                Connected TikTok account
              </p>
            )}
          </div>
        </div>
      ) : null}

      {!connected ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          TikTok isn&apos;t connected yet. You can still set these — they&apos;ll apply once you
          connect, and aren&apos;t required to queue until then.
        </p>
      ) : null}

      {connected && ci && !ci.available ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Couldn&apos;t load live TikTok settings right now; showing the standard options.
        </p>
      ) : null}

      {connected && live && !live.canPost ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-600">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          TikTok says this account can&apos;t accept a new post right now. Try again later.
        </p>
      ) : null}

      {/* Privacy — no default; the user must choose. */}
      <div className="space-y-1">
        <Label
          htmlFor="tiktok-privacy"
          className={`text-xs ${privacyMissing ? 'text-destructive' : ''}`}
        >
          Who can view this video{privacyMissing ? ' *' : ''}
        </Label>
        <Select
          value={privacy || undefined}
          onValueChange={(v) => setPrivacy(v as TikTokPrivacyLevel)}
        >
          <SelectTrigger
            id="tiktok-privacy"
            aria-invalid={privacyMissing || undefined}
            className={`h-9 ${
              privacyMissing
                ? 'border-destructive text-destructive focus:ring-destructive ring-destructive/40 ring-1'
                : ''
            }`}
          >
            <SelectValue placeholder="Select who can view…" />
          </SelectTrigger>
          <SelectContent>
            {privacyOptions.map((level) => {
              const disableSelfOnly = level === 'SELF_ONLY' && brandedActive;
              return (
                <SelectItem key={level} value={level} disabled={disableSelfOnly}>
                  {TIKTOK_PRIVACY_LABELS[level]}
                  {disableSelfOnly ? ' — not allowed for branded content' : ''}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {privacyMissing ? (
          <p className="text-destructive flex items-start gap-1.5 text-xs">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This can&apos;t be blank — choose who can view this video to add it to the queue.
          </p>
        ) : null}
      </div>

      {/* Interaction abilities — off by default; greyed when disabled in-app. */}
      <div className="space-y-1.5">
        <Label className="text-xs">Allow users to</Label>
        <div className="space-y-1.5">
          <CheckRow
            label="Comment"
            checked={allowComment && !commentDisabled}
            disabled={commentDisabled}
            disabledHint="Disabled in the creator's TikTok settings"
            onChange={setAllowComment}
          />
          <CheckRow
            label="Duet"
            checked={allowDuet && !duetDisabled}
            disabled={duetDisabled}
            disabledHint="Disabled in the creator's TikTok settings"
            onChange={setAllowDuet}
          />
          <CheckRow
            label="Stitch"
            checked={allowStitch && !stitchDisabled}
            disabled={stitchDisabled}
            disabledHint="Disabled in the creator's TikTok settings"
            onChange={setAllowStitch}
          />
        </div>
      </div>

      {/* Commercial content disclosure — off by default. */}
      <div className="space-y-1.5 border-t pt-3">
        <CheckRow
          label="Disclose video content"
          description="Turn on if this promotes goods or services in exchange for something of value."
          checked={commercial}
          onChange={setCommercial}
        />
        {commercial ? (
          <div className="space-y-1.5 pl-6">
            <CheckRow
              label="Your brand"
              description="Promoting yourself or your own business (Brand Organic)."
              checked={brandOrganic}
              onChange={setBrandOrganic}
            />
            <CheckRow
              label="Branded content"
              description="Promoting another brand or a third party (Paid partnership)."
              checked={brandedContent}
              onChange={setBrandedContent}
            />
            {commercialNeedsChoice ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-600">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                You need to indicate if your content promotes yourself, a third party, or both.
              </p>
            ) : null}
            {contentLabel ? (
              <p className="text-muted-foreground text-xs">
                Your video will be labeled as “{contentLabel}”.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Outstanding requirements that keep this video out of the queue. */}
      {connected && reasons.length > 0 ? (
        <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="h-3.5 w-3.5" /> Needed before queueing
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">{consent}</p>
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          {setTiktokMeta.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </>
          ) : setTiktokMeta.isSuccess ? (
            <>
              <Check className="h-3 w-3 text-emerald-600" /> Saved
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}
