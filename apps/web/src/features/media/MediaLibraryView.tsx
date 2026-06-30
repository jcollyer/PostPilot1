'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Film,
  FolderInput,
  FolderPlus,
  Info,
  ListChecks,
  ListPlus,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Search,
  Share2,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';

import {
  DEFAULT_TIKTOK_OPTIONS,
  mediaStatusSchema,
  tiktokConsentDeclaration,
  type MediaStatus,
  type Platform,
} from '@postpilot/types';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc/client';
import { EditMetadataDialog } from './EditMetadataDialog';
import {
  PlatformChips,
  selectedFromTargets,
  targetsFromSelected,
  useConnectedPlatforms,
  useTikTokAccount,
} from './PlatformTargets';
import { UploadDialog } from './UploadDialog';
import { FolderBreadcrumbs } from './FolderBreadcrumbs';
import { FolderCard } from './FolderCard';
import { FolderTree } from './FolderTree';
import { MoveToFolderDialog } from './MoveToFolderDialog';
import { NewFolderDialog } from './NewFolderDialog';
import { RenameFolderDialog } from './RenameFolderDialog';
import type { FolderDto, VideoDto } from './types';
import { formatBytes, formatDuration } from './upload';

const STATUS_OPTIONS = mediaStatusSchema.options;

export function MediaLibraryView() {
  const utils = trpc.useUtils();

  // Refresh whichever list is on screen. Browse mode reads `folder.list`, search
  // mode reads `media.list`, so mutations invalidate both (plus the tree).
  const refresh = () => {
    void utils.media.list.invalidate();
    void utils.folder.list.invalidate();
    void utils.folder.children.invalidate();
  };

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MediaStatus | ''>('');
  const [categoryId, setCategoryId] = useState('');

  // Folder navigation. null = the library root. While a search/filter is active
  // we show flat results across the whole library instead of a single folder.
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<FolderDto | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderDto | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const categories = trpc.media.listCategories.useQuery();
  const { connected } = useConnectedPlatforms();
  const tiktokAccount = useTikTokAccount();

  // Per-video platform targeting. The card keeps optimistic local state, so we
  // only refresh the queue (whose plan can change) — not the media list.
  const setTargets = trpc.media.setTargetPlatforms.useMutation({
    onSuccess: () => utils.queue.invalidate(),
  });
  const setTargetsMany = trpc.media.setTargetPlatformsMany.useMutation({
    onSuccess: () => {
      refresh();
      utils.queue.invalidate();
    },
  });

  // Poll the AI-status summary while anything is still pending/running so the
  // counts (and the cards) reflect the worker's progress.
  const aiSummary = trpc.media.aiSummary.useQuery(
    {},
    {
      refetchInterval: (q) =>
        q.state.data && (q.state.data.PENDING > 0 || q.state.data.RUNNING > 0) ? 4000 : false,
    },
  );
  const busy = (aiSummary.data?.PENDING ?? 0) + (aiSummary.data?.RUNNING ?? 0) > 0;

  // Keep the grid fresh while the worker is processing.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => refresh(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, utils]);

  const regenerate = trpc.media.regenerateMetadata.useMutation({
    onSuccess: () => {
      aiSummary.refetch();
      refresh();
    },
  });

  // Any active search/filter switches the view to flat, library-wide results.
  const isSearching = search.length > 0 || Boolean(status) || Boolean(categoryId);

  // Browse mode — the current folder's direct contents (folders + its videos).
  const browseQuery = trpc.folder.list.useInfiniteQuery(
    { parentId: currentFolderId, limit: 24 },
    { getNextPageParam: (last) => last.videos.nextCursor, enabled: !isSearching },
  );

  // Search mode — flat video results across the whole library (folder ignored).
  const searchQuery = trpc.media.list.useInfiniteQuery(
    {
      limit: 24,
      search: search || undefined,
      status: status || undefined,
      categoryId: categoryId || undefined,
    },
    { getNextPageParam: (last) => last.nextCursor, enabled: isSearching },
  );

  const query = isSearching ? searchQuery : browseQuery;

  const videos = useMemo<VideoDto[]>(() => {
    if (isSearching) return searchQuery.data?.pages.flatMap((p) => p.items) ?? [];
    return browseQuery.data?.pages.flatMap((p) => p.videos.items) ?? [];
  }, [isSearching, searchQuery.data, browseQuery.data]);

  // Folders only appear when browsing (not in search results).
  const folders = useMemo<FolderDto[]>(
    () => (isSearching ? [] : (browseQuery.data?.pages.flatMap((p) => p.folders) ?? [])),
    [isSearching, browseQuery.data],
  );

  const remove = trpc.media.remove.useMutation({ onSuccess: refresh });
  const removeFolder = trpc.folder.remove.useMutation({
    onSuccess: () => {
      setDeletingFolder(null);
      refresh();
      void utils.folder.breadcrumbs.invalidate();
      aiSummary.refetch();
    },
  });
  const [queueMsg, setQueueMsg] = useState<string | null>(null);
  const addToQueue = trpc.queue.addVideos.useMutation({
    onSuccess: (res) => {
      utils.queue.invalidate();
      refresh();
      const parts: string[] = [];
      if (res.added > 0) {
        // 5d: tell the user processing can take a few minutes after publishing.
        parts.push(
          `${res.added} video${res.added === 1 ? '' : 's'} added to the queue. After publishing, it can take a few minutes to process and appear on your profile.`,
        );
      }
      if (res.blocked > 0) {
        parts.push(
          `${res.blocked} video${res.blocked === 1 ? '' : 's'} couldn’t be queued — add the required TikTok details first.`,
        );
      }
      setQueueMsg(parts.length ? parts.join(' ') : null);
    },
  });
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());

  // TikTok requires express consent (with a declaration) before content is sent
  // to TikTok, so queueing a TikTok-targeted video goes through a confirmation.
  const [consent, setConsent] = useState<{
    videoIds: string[];
    addableIds: string[];
    branded: boolean;
  } | null>(null);

  // A video posts to TikTok when it explicitly targets it, or when it's left on
  // the "all connected" default (empty targetPlatforms) and TikTok is connected.
  const videoTargetsTikTok = (v: VideoDto) =>
    connected.has('TIKTOK') &&
    (v.targetPlatforms.length === 0 || v.targetPlatforms.includes('TIKTOK'));

  const performQueue = (videoIds: string[], addableIds: string[]) => {
    addToQueue.mutate({ videoIds });
    setQueuedIds((prev) => {
      const next = new Set(prev);
      addableIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // Gate queueing behind the TikTok consent dialog when any to-be-queued video
  // will actually post to TikTok; otherwise queue straight away.
  const requestQueue = (videoIds: string[]) => {
    const vids = videos.filter((v) => videoIds.includes(v.id));
    const addable = vids.filter((v) => !v.tiktokNeedsInput);
    const addableIds = addable.map((v) => v.id);
    const tiktokAddable = addable.filter(videoTargetsTikTok);
    if (tiktokAddable.length > 0) {
      setConsent({
        videoIds,
        addableIds,
        branded: tiktokAddable.some((v) => v.tiktokBranded),
      });
      return;
    }
    performQueue(videoIds, addableIds);
  };

  const confirmConsent = () => {
    if (!consent) return;
    performQueue(consent.videoIds, consent.addableIds);
    setConsent(null);
  };

  const [editing, setEditing] = useState<VideoDto | null>(null);
  const [previewing, setPreviewing] = useState<VideoDto | null>(null);

  // ---- Multi-select ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Bulk "Set platforms" dialog: open flag + the working selection.
  const [platformsDialog, setPlatformsDialog] = useState(false);
  const [bulkPlatforms, setBulkPlatforms] = useState<Set<Platform>>(() => selectedFromTargets([]));

  const clearSelection = () => setSelectedIds(new Set());

  // Navigate the main pane to a folder (null = root). Clears any selection and
  // the search box so you land in a clean browse view of that folder.
  const navigateToFolder = (id: string | null) => {
    setCurrentFolderId(id);
    clearSelection();
    setSearchInput('');
    setSearch('');
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Drop any selected ids that have scrolled out of the current result set.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(videos.map((v) => v.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [videos]);

  const selectedCount = selectedIds.size;
  const selectionActive = selectedCount > 0;
  const allVisibleSelected = videos.length > 0 && videos.every((v) => selectedIds.has(v.id));
  const toggleSelectAll = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(videos.map((v) => v.id)));

  const removeMany = trpc.media.removeMany.useMutation({
    onSuccess: () => {
      clearSelection();
      setConfirmDelete(false);
      refresh();
      aiSummary.refetch();
    },
  });
  const setCategoryMany = trpc.media.setCategoryMany.useMutation({
    onSuccess: () => {
      clearSelection();
      refresh();
    },
  });

  // Videos in the current selection still missing required TikTok input.
  const blockedSelectedCount = useMemo(
    () => videos.filter((v) => selectedIds.has(v.id) && v.tiktokNeedsInput).length,
    [videos, selectedIds],
  );
  const addableSelectedCount = selectedCount - blockedSelectedCount;

  const bulkAddToQueue = () => {
    // Routes through requestQueue, which gates on TikTok consent when needed and
    // optimistically marks only the videos the server will actually queue.
    requestQueue([...selectedIds]);
    clearSelection();
  };
  const bulkRegenerate = () => regenerate.mutate({ videoIds: [...selectedIds] });

  const bulkBusy =
    removeMany.isPending ||
    setCategoryMany.isPending ||
    setTargetsMany.isPending ||
    addToQueue.isPending ||
    regenerate.isPending;

  const openPlatformsDialog = () => {
    setBulkPlatforms(selectedFromTargets([]));
    setPlatformsDialog(true);
  };
  const applyBulkPlatforms = () => {
    setTargetsMany.mutate(
      { videoIds: [...selectedIds], platforms: targetsFromSelected(bulkPlatforms) },
      {
        onSuccess: () => {
          setPlatformsDialog(false);
          clearSelection();
        },
      },
    );
  };

  const hasFilters = Boolean(search || status || categoryId);

  return (
    <div className="mx-auto flex max-w-6xl gap-6">
      {/* Left: lazy-loading folder tree (Dropbox-style). */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-4 space-y-2">
          <div className="flex items-center justify-between px-2">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Folders
            </span>
            <button
              type="button"
              onClick={() => setNewFolderOpen(true)}
              aria-label="New folder"
              title="New folder"
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded-md"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          <FolderTree currentFolderId={currentFolderId} onSelect={navigateToFolder} />
        </div>
      </aside>

      {/* Right: breadcrumbs + contents of the current folder (or search results). */}
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Media Library</h1>
            <FolderBreadcrumbs currentFolderId={currentFolderId} onNavigate={navigateToFolder} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => regenerate.mutate({})}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending || busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate metadata
            </Button>
            <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              New folder
            </Button>
            <UploadDialog onUploaded={refresh} folderId={currentFolderId} />
          </div>
        </div>

        {aiSummary.data && aiSummary.data.total > 0 ? (
          <div className="text-muted-foreground bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs">
            <span className="text-foreground font-medium">AI metadata</span>
            {busy ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {aiSummary.data.RUNNING} processing · {aiSummary.data.PENDING} queued
              </span>
            ) : (
              <span>{aiSummary.data.COMPLETED} processed</span>
            )}
            {aiSummary.data.FAILED > 0 ? (
              <button
                type="button"
                onClick={() => regenerate.mutate({ onlyFailed: true })}
                className="text-destructive hover:underline"
              >
                Retry {aiSummary.data.FAILED} failed
              </button>
            ) : null}
            {busy ? (
              <span className="text-muted-foreground/70">
                The AI worker drains the queue — counts update as it runs.
              </span>
            ) : null}
          </div>
        ) : null}

        {queueMsg ? (
          <div className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {queueMsg}
            </span>
            <button
              type="button"
              onClick={() => setQueueMsg(null)}
              className="text-amber-700 hover:text-amber-900"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, caption, transcript, filename…"
              className="pl-9"
            />
          </div>
          <Select
            value={status || 'all'}
            onValueChange={(v) => setStatus(v === 'all' ? '' : (v as MediaStatus))}
          >
            <SelectTrigger className="w-auto min-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categoryId || 'all'}
            onValueChange={(v) => setCategoryId(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-auto min-w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectionActive ? (
          <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={clearSelection}
              className="text-muted-foreground hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{selectedCount} selected</span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
            >
              {allVisibleSelected ? 'Deselect all' : 'Select all'}
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {blockedSelectedCount > 0 ? (
                <span
                  className="flex items-center gap-1 text-xs text-amber-600"
                  title="These videos need TikTok details before they can be queued."
                >
                  <TriangleAlert className="h-3.5 w-3.5" />
                  {blockedSelectedCount} need TikTok details
                </span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={bulkAddToQueue}
                disabled={bulkBusy || addableSelectedCount === 0}
                title={
                  addableSelectedCount === 0
                    ? 'Every selected video still needs TikTok details.'
                    : undefined
                }
              >
                <ListPlus className="mr-2 h-4 w-4" />
                Add to queue
              </Button>
              <Button size="sm" variant="outline" onClick={bulkRegenerate} disabled={bulkBusy}>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate metadata
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={bulkBusy}>
                    <Tag className="mr-2 h-4 w-4" />
                    Set category
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                  {categories.data?.length ? (
                    categories.data.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() =>
                          setCategoryMany.mutate({ videoIds: [...selectedIds], categoryId: c.id })
                        }
                      >
                        <span
                          className="mr-2 h-3 w-3 rounded-full"
                          style={{ backgroundColor: c.color ?? 'rgb(148 163 184)' }}
                        />
                        {c.name}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>No categories yet</DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-muted-foreground cursor-pointer"
                    onClick={() =>
                      setCategoryMany.mutate({ videoIds: [...selectedIds], categoryId: null })
                    }
                  >
                    <X className="mr-2 h-4 w-4" /> Remove category
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" onClick={openPlatformsDialog} disabled={bulkBusy}>
                <Share2 className="mr-2 h-4 w-4" />
                Set platforms
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMoveOpen(true)}
                disabled={bulkBusy}
              >
                <FolderInput className="mr-2 h-4 w-4" />
                Move
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={bulkBusy}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your library…
          </div>
        ) : folders.length === 0 && videos.length === 0 ? (
          <EmptyState
            hasFilters={hasFilters}
            isSearching={isSearching}
            inFolder={currentFolderId !== null}
          />
        ) : (
          <>
            {folders.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onOpen={() => navigateToFolder(folder.id)}
                    onRename={() => setRenamingFolder(folder)}
                    onDelete={() => setDeletingFolder(folder)}
                  />
                ))}
              </div>
            ) : null}

            {videos.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    selected={selectedIds.has(video.id)}
                    selectionActive={selectionActive}
                    onToggleSelect={() => toggleSelect(video.id)}
                    onPreview={() => setPreviewing(video)}
                    onEdit={() => setEditing(video)}
                    onDelete={() => remove.mutate({ videoId: video.id })}
                    deleting={remove.isPending && remove.variables?.videoId === video.id}
                    onAddToQueue={() => requestQueue([video.id])}
                    queued={queuedIds.has(video.id)}
                    connected={connected}
                    tiktokAccountLabel={tiktokAccount.nickname ?? tiktokAccount.username}
                    tiktokAvatarUrl={tiktokAccount.avatarUrl}
                    onSetTargets={(platforms) =>
                      setTargets.mutate({ videoId: video.id, platforms })
                    }
                  />
                ))}
              </div>
            ) : null}

            {query.hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}

        {editing ? (
          <EditMetadataDialog
            video={editing}
            open={Boolean(editing)}
            onOpenChange={(o) => !o && setEditing(null)}
            onSaved={refresh}
          />
        ) : null}

        <PreviewDialog video={previewing} onOpenChange={(o) => !o && setPreviewing(null)} />

        <Dialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Delete {selectedCount} video{selectedCount === 1 ? '' : 's'}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              This permanently removes the selected video{selectedCount === 1 ? '' : 's'} and their
              files. This can’t be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => removeMany.mutate({ videoIds: [...selectedIds] })}
                disabled={removeMany.isPending}
              >
                {removeMany.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={platformsDialog} onOpenChange={(o) => !o && setPlatformsDialog(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Post {selectedCount} video{selectedCount === 1 ? '' : 's'} to…
              </DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              Choose which platforms these videos publish to. Platforms you haven’t connected yet
              are marked — they’ll publish once connected.
            </p>
            <div className="py-1">
              <PlatformChips
                selected={bulkPlatforms}
                connected={connected}
                onChange={setBulkPlatforms}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPlatformsDialog(false)}>
                Cancel
              </Button>
              <Button onClick={applyBulkPlatforms} disabled={setTargetsMany.isPending}>
                {setTargetsMany.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Apply
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* TikTok consent: declaration (§4) + express consent before upload (§5c) +
          processing-time notice (§5d), shown before any TikTok-bound queueing. */}
        <Dialog open={Boolean(consent)} onOpenChange={(o) => !o && setConsent(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Post to TikTok</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1 text-sm">
              <p>
                {tiktokConsentDeclaration({
                  ...DEFAULT_TIKTOK_OPTIONS,
                  commercialDisclosure: consent?.branded ?? false,
                  brandedContent: consent?.branded ?? false,
                })}
              </p>
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                After you publish, it can take a few minutes for TikTok to finish processing your
                post before it appears on your profile.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConsent(null)}>
                Cancel
              </Button>
              <Button onClick={confirmConsent} disabled={addToQueue.isPending}>
                {addToQueue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Agree &amp; add to queue
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <MoveToFolderDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          videoIds={[...selectedIds]}
          onMoved={clearSelection}
        />

        {/* Folder create / rename / delete */}
        <NewFolderDialog
          open={newFolderOpen}
          onOpenChange={setNewFolderOpen}
          parentId={currentFolderId}
          onCreated={(folder) => navigateToFolder(folder.id)}
        />

        <RenameFolderDialog
          folder={renamingFolder}
          onOpenChange={(o) => !o && setRenamingFolder(null)}
        />

        <Dialog
          open={Boolean(deletingFolder)}
          onOpenChange={(o) => !o && !removeFolder.isPending && setDeletingFolder(null)}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete “{deletingFolder?.name}”?</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              This permanently deletes this folder, everything inside it — including all subfolders
              and their videos — and the video files themselves. This can’t be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeletingFolder(null)}
                disabled={removeFolder.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  deletingFolder && removeFolder.mutate({ folderId: deletingFolder.id })
                }
                disabled={removeFolder.isPending}
              >
                {removeFolder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete folder
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function EmptyState({
  hasFilters,
  isSearching,
  inFolder,
}: {
  hasFilters: boolean;
  isSearching: boolean;
  inFolder: boolean;
}) {
  const title = isSearching ? 'No results' : inFolder ? 'This folder is empty' : 'No videos yet';
  const body = isSearching
    ? 'Try clearing the search or filters.'
    : inFolder
      ? 'Upload videos here, create a subfolder, or move items into this folder.'
      : 'Upload a batch of videos to get started — they upload straight to storage and we build your queue from there.';
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <Film className="text-muted-foreground h-8 w-8" />
      <p className="font-medium">
        {hasFilters && !isSearching ? 'No videos match those filters' : title}
      </p>
      <p className="text-muted-foreground max-w-sm text-sm">{body}</p>
    </div>
  );
}

const STATUS_BADGE: Record<MediaStatus, { label: string; className: string }> = {
  UPLOADING: { label: 'Uploading', className: 'bg-blue-100 text-blue-800' },
  PROCESSING: { label: 'Processing', className: 'bg-amber-100 text-amber-800' },
  READY: { label: 'Ready', className: 'bg-emerald-100 text-emerald-800' },
  FAILED: { label: 'Failed', className: 'bg-red-100 text-red-800' },
};

function VideoCard({
  video,
  selected,
  selectionActive,
  onToggleSelect,
  onPreview,
  onEdit,
  onDelete,
  deleting,
  onAddToQueue,
  queued,
  connected,
  tiktokAccountLabel,
  tiktokAvatarUrl,
  onSetTargets,
}: {
  video: VideoDto;
  selected: boolean;
  selectionActive: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  onAddToQueue: () => void;
  queued: boolean;
  connected: Set<Platform>;
  tiktokAccountLabel: string | null;
  tiktokAvatarUrl: string | null;
  onSetTargets: (platforms: Platform[]) => void;
}) {
  const badge = STATUS_BADGE[video.status];
  const duration = formatDuration(video.durationSec);
  const canPreview = Boolean(video.cdnUrl) && video.status === 'READY';
  const aiBusy = video.aiStatus === 'PENDING' || video.aiStatus === 'RUNNING';
  const isQueued = video.inQueue || queued;

  // Optimistic local mirror of the video's platform targets so toggling a chip
  // feels instant; the mutation persists in the background.
  const [targetSel, setTargetSel] = useState<Set<Platform>>(() =>
    selectedFromTargets(video.targetPlatforms),
  );
  useEffect(() => {
    setTargetSel(selectedFromTargets(video.targetPlatforms));
  }, [video.targetPlatforms]);

  const onToggleTarget = (next: Set<Platform>) => {
    setTargetSel(next);
    onSetTargets(targetsFromSelected(next));
  };

  return (
    <div
      className={`bg-card group relative overflow-hidden rounded-lg border transition ${
        selected ? 'ring-primary ring-2' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        aria-label={selected ? 'Deselect video' : 'Select video'}
        aria-pressed={selected}
        className={`absolute right-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition ${
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-white/70 bg-black/40 text-transparent hover:text-white'
        } ${selectionActive || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Check className="h-4 w-4" />
      </button>
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEdit();
          }
        }}
        aria-label="Edit details"
        className="bg-muted relative flex aspect-[9/16] w-full cursor-pointer items-center justify-center"
      >
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt={video.title ?? 'Thumbnail'}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Film className="text-muted-foreground h-8 w-8" />
        )}

        <span className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
          {isQueued ? (
            <span
              title="This video is in your queue"
              className="flex items-center gap-0.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              <ListChecks className="h-3 w-3" /> Queued
            </span>
          ) : null}
          {video.tiktokNeedsInput ? (
            <span
              title="Needs TikTok details before queueing"
              className="flex items-center gap-0.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              <TriangleAlert className="h-3 w-3" /> Input
            </span>
          ) : null}
          {video.isDuplicate ? (
            <span
              title="Possible duplicate"
              className="flex items-center gap-0.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              <Copy className="h-3 w-3" /> Dup
            </span>
          ) : null}
          {aiBusy ? (
            <span
              title="AI is processing this video"
              className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing
            </span>
          ) : video.aiStatus === 'COMPLETED' ? (
            <span
              title="AI metadata ready"
              className="flex items-center rounded bg-violet-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              <Sparkles className="h-3 w-3" />
            </span>
          ) : video.aiStatus === 'FAILED' ? (
            <span
              title="AI processing failed"
              className="flex items-center rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              <TriangleAlert className="h-3 w-3" />
            </span>
          ) : null}
        </span>
        {canPreview ? (
          <button
            type="button"
            aria-label="Play video"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="absolute left-1/2 top-1/2 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition hover:bg-black/70 group-hover:opacity-100"
          >
            <Play className="h-6 w-6" />
          </button>
        ) : null}
        {duration ? (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {duration}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p
            className="min-w-0 flex-1 truncate text-sm font-medium"
            title={video.title ?? undefined}
          >
            {video.title ?? video.originalFilename ?? 'Untitled'}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Video actions"
                className="text-muted-foreground hover:text-foreground -mr-1 shrink-0"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {video.status === 'READY' ? (
                video.tiktokNeedsInput ? (
                  <DropdownMenuItem
                    disabled
                    className="cursor-not-allowed"
                    title="This video needs TikTok details before it can be queued."
                  >
                    <TriangleAlert className="mr-2 h-4 w-4 shrink-0 text-amber-600" />
                    <span className="flex flex-col">
                      <span>Add to queue</span>
                      <span className="text-muted-foreground text-[11px]">
                        Requires TikTok details
                      </span>
                    </span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={onAddToQueue}
                    disabled={isQueued}
                    className="cursor-pointer"
                  >
                    {isQueued ? (
                      <Check className="mr-2 h-4 w-4 text-emerald-600" />
                    ) : (
                      <ListPlus className="mr-2 h-4 w-4" />
                    )}
                    {isQueued ? 'In queue' : 'Add to queue'}
                  </DropdownMenuItem>
                )
              ) : null}
              {video.tiktokNeedsInput && video.status === 'READY' ? (
                <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                  <Pencil className="mr-2 h-4 w-4" /> Add TikTok details
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
                <Pencil className="mr-2 h-4 w-4" /> Edit details
              </DropdownMenuItem>
              {canPreview ? (
                <DropdownMenuItem onClick={onPreview} className="cursor-pointer">
                  <Play className="mr-2 h-4 w-4" /> Preview
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={onDelete}
                disabled={deleting}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <span className="text-muted-foreground text-[11px]">{formatBytes(video.fileSize)}</span>
        </div>

        {video.category ? (
          <span
            className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={
              video.category.color
                ? { backgroundColor: `${video.category.color}20`, color: video.category.color }
                : { backgroundColor: 'rgb(241 245 249)', color: 'rgb(51 65 85)' }
            }
          >
            {video.category.name}
          </span>
        ) : null}

        <div className="space-y-1 border-t pt-2">
          <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
            Post to
          </p>
          <PlatformChips
            selected={targetSel}
            connected={connected}
            onChange={onToggleTarget}
            size="xs"
            tiktokAvatarUrl={tiktokAvatarUrl}
          />
          {targetSel.has('TIKTOK') && connected.has('TIKTOK') && tiktokAccountLabel ? (
            <p
              className="text-muted-foreground truncate text-[10px]"
              title={`Will post to TikTok as ${tiktokAccountLabel}`}
            >
              TikTok: <span className="font-medium">{tiktokAccountLabel}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreviewDialog({
  video,
  onOpenChange,
}: {
  video: VideoDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(video)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">
            {video?.title ?? video?.originalFilename ?? 'Preview'}
          </DialogTitle>
        </DialogHeader>
        {video?.cdnUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={video.cdnUrl}
            poster={video.coverImageUrl ?? undefined}
            controls
            autoPlay
            className="max-h-[70vh] w-full rounded-md bg-black"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
