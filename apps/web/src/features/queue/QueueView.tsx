'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Film,
  GripVertical,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shuffle,
  SkipForward,
  Trash2,
} from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';
import { PLATFORM_LABELS, type Platform } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';
import { ScheduleEditor } from './ScheduleEditor';
import { formatDayHeading, formatSlot, formatTime } from './format';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type QueueItem = RouterOutputs['queue']['get']['items'][number];
type Upcoming = RouterOutputs['queue']['upcoming'];

const PLATFORM_SHORT: Record<Platform, string> = {
  TIKTOK: 'TikTok',
  INSTAGRAM: 'IG',
  YOUTUBE: 'YT',
};

export function QueueView() {
  const utils = trpc.useUtils();
  // Poll while anything is mid-publish so the UI tracks the worker.
  const queue = trpc.queue.get.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.items.some(
        (i) => i.status === 'PUBLISHING' || i.tasks.some((t) => t.status === 'PROCESSING'),
      )
        ? 15000
        : false,
  });
  const upcoming = trpc.queue.upcoming.useQuery({ limit: 50 });

  const refresh = () => {
    utils.queue.get.invalidate();
    utils.queue.upcoming.invalidate();
  };

  const pause = trpc.queue.pause.useMutation({ onSuccess: refresh });
  const resume = trpc.queue.resume.useMutation({ onSuccess: refresh });
  const smartArrange = trpc.queue.smartArrange.useMutation({ onSuccess: refresh });
  const move = trpc.queue.move.useMutation({ onSettled: refresh });
  const removeItem = trpc.queue.removeItem.useMutation({ onSuccess: refresh });
  const skip = trpc.queue.skip.useMutation({ onSuccess: refresh });
  const unskip = trpc.queue.unskip.useMutation({ onSuccess: refresh });
  const retryPublish = trpc.queue.retryPublish.useMutation({ onSuccess: refresh });

  // Local mirror of the server order so drag feels instant.
  const serverItems = queue.data?.items ?? [];
  const [order, setOrder] = useState<QueueItem[]>(serverItems);
  useEffect(() => {
    setOrder(queue.data?.items ?? []);
  }, [queue.data]);

  const active = order.filter((i) => i.status !== 'SKIPPED' && i.status !== 'COMPLETED');
  const skipped = order.filter((i) => i.status === 'SKIPPED');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const ids = active.map((i) => i.id);
    const oldIndex = ids.indexOf(a.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;

    const newActive = arrayMove(active, oldIndex, newIndex);
    setOrder([...newActive, ...skipped]);
    const afterItemId = newIndex === 0 ? null : newActive[newIndex - 1]!.id;
    move.mutate({ itemId: a.id as string, afterItemId });
  };

  const isPaused = queue.data?.status === 'PAUSED';
  const busy = move.isPending || smartArrange.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
          <p className="text-muted-foreground text-sm">
            {active.length} in rotation · PostPilot publishes the top of the queue at each scheduled
            time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => smartArrange.mutate()}
            disabled={busy || active.length < 3}
            title="Reorder to space similar videos apart"
          >
            {smartArrange.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shuffle className="mr-2 h-4 w-4" />
            )}
            Smart arrange
          </Button>
          {isPaused ? (
            <Button onClick={() => resume.mutate()} disabled={resume.isPending}>
              <Play className="mr-2 h-4 w-4" /> Resume queue
            </Button>
          ) : (
            <Button variant="outline" onClick={() => pause.mutate()} disabled={pause.isPending}>
              <Pause className="mr-2 h-4 w-4" /> Pause queue
            </Button>
          )}
        </div>
      </div>

      {isPaused ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          The queue is paused — nothing will publish until you resume.
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Up next</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {queue.isLoading ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : active.length === 0 ? (
                <EmptyQueue />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={active.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="space-y-2">
                      {active.map((item) => (
                        <SortableRow
                          key={item.id}
                          item={item}
                          onSkip={() => skip.mutate({ itemId: item.id })}
                          onRemove={() => removeItem.mutate({ itemId: item.id })}
                          onRetry={(taskId) => retryPublish.mutate({ taskId })}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}

              {skipped.length > 0 ? (
                <div className="space-y-2 pt-3">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Skipped
                  </p>
                  {skipped.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border border-dashed p-2 opacity-70"
                    >
                      <Thumb url={item.video.thumbnailUrl} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.video.title ?? item.video.originalFilename ?? 'Untitled'}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => unskip.mutate({ itemId: item.id })}>
                        <RotateCcw className="mr-1 h-4 w-4" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <ScheduleEditor onChanged={refresh} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" /> Upcoming posts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UpcomingList data={upcoming.data} loading={upcoming.isLoading} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Film className="text-muted-foreground h-7 w-7" />
      <p className="font-medium">Your queue is empty</p>
      <p className="text-muted-foreground max-w-xs text-sm">
        Add ready videos from your Media Library, set a schedule, and PostPilot takes it from there.
      </p>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="bg-muted flex h-12 w-8 shrink-0 items-center justify-center overflow-hidden rounded">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Film className="text-muted-foreground h-4 w-4" />
      )}
    </div>
  );
}

function SortableRow({
  item,
  onSkip,
  onRemove,
  onRetry,
}: {
  item: QueueItem;
  onSkip: () => void;
  onRemove: () => void;
  onRetry: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-card p-2 ${
        isDragging ? 'shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Thumb url={item.video.thumbnailUrl} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">
            {item.video.title ?? item.video.originalFilename ?? 'Untitled'}
          </span>
          {item.video.isDuplicate ? (
            <Copy className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Possible duplicate" />
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span>{item.scheduledAt ? formatSlot(item.scheduledAt) : 'Awaiting a slot'}</span>
          {item.tasks.map((t) => (
            <TaskChip key={t.id} task={t} onRetry={() => onRetry(t.id)} />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onSkip}
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Skip"
          title="Skip"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-1"
          aria-label="Remove"
          title="Remove from queue"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

type QueueTask = QueueItem['tasks'][number];

function TaskChip({ task, onRetry }: { task: QueueTask; onRetry: () => void }) {
  const label = PLATFORM_SHORT[task.platform];
  const full = PLATFORM_LABELS[task.platform];
  const base = 'inline-flex items-center gap-0.5 rounded px-1';

  if (task.status === 'PUBLISHED') {
    const cls = `${base} bg-emerald-100 text-emerald-700`;
    if (task.postUrl) {
      return (
        <a href={task.postUrl} target="_blank" rel="noopener noreferrer" className={cls} title={`Posted to ${full}`}>
          <Check className="h-3 w-3" /> {label} <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    return (
      <span className={cls} title={`Posted to ${full}`}>
        <Check className="h-3 w-3" /> {label}
      </span>
    );
  }

  if (task.status === 'PROCESSING') {
    return (
      <span className={`${base} bg-blue-100 text-blue-700`} title={`Publishing to ${full}…`}>
        <Loader2 className="h-3 w-3 animate-spin" /> {label}
      </span>
    );
  }

  if (task.status === 'FAILED' || task.status === 'HELD') {
    const title = task.needsConnection
      ? `${full}: reconnect needed — click to retry`
      : `${full}: ${task.lastError ?? 'failed'} — click to retry`;
    return (
      <button
        type="button"
        onClick={onRetry}
        className={`${base} bg-red-100 text-red-700 hover:bg-red-200`}
        title={title}
      >
        <AlertTriangle className="h-3 w-3" /> {label} <RefreshCw className="h-3 w-3" />
      </button>
    );
  }

  // SCHEDULED / PENDING
  return (
    <span className={`${base} bg-slate-100 text-slate-600`} title={`Scheduled for ${full}`}>
      {label}
    </span>
  );
}

function UpcomingList({ data, loading }: { data: Upcoming | undefined; loading: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, Upcoming>();
    for (const post of data ?? []) {
      const key = formatDayHeading(post.scheduledAt);
      const arr = map.get(key) ?? [];
      arr.push(post);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [data]);

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing scheduled yet. Add a schedule and queued videos will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([day, posts]) => (
        <div key={day}>
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
            {day}
          </p>
          <ul className="space-y-1.5">
            {posts.map((p) => (
              <li key={p.taskId} className="flex items-center gap-2 text-sm">
                <Thumb url={p.thumbnailUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{p.title ?? 'Untitled'}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatTime(p.scheduledAt)} · {PLATFORM_LABELS[p.platform]}
                    {p.needsConnection ? (
                      <span className="text-red-600"> · reconnect needed</span>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
