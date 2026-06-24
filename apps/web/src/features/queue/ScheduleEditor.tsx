'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';

import { PLATFORM_LABELS, platformSchema, type Platform } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { DAY_LABELS } from './format';

const BROWSER_TZ =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

interface ScheduleDraft {
  name: string;
  timezone: string;
  daysOfWeek: number[];
  times: string[];
  platforms: Platform[];
  isActive: boolean;
}

function summarize(s: { daysOfWeek: number[]; times: string[]; platforms: Platform[] }): string {
  const days =
    s.daysOfWeek.length === 7
      ? 'Every day'
      : s.daysOfWeek
          .slice()
          .sort((a, b) => a - b)
          .map((d) => DAY_LABELS[d])
          .join(', ');
  const times = s.times.join(', ');
  const platforms =
    s.platforms.length === 0
      ? 'all connected'
      : s.platforms.map((p) => PLATFORM_LABELS[p]).join(', ');
  return `${days} at ${times} → ${platforms}`;
}

export function ScheduleEditor({ onChanged }: { onChanged: () => void }) {
  const schedules = trpc.queue.listSchedules.useQuery();
  const [adding, setAdding] = useState(false);

  const remove = trpc.queue.deleteSchedule.useMutation({
    onSuccess: () => {
      schedules.refetch();
      onChanged();
    },
  });
  const update = trpc.queue.updateSchedule.useMutation({
    onSuccess: () => {
      schedules.refetch();
      onChanged();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Schedules</h2>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add schedule
          </Button>
        ) : null}
      </div>

      {schedules.data && schedules.data.length > 0 ? (
        <ul className="space-y-2">
          {schedules.data.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name || 'Schedule'}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {summarize(s)} · {s.timezone}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={s.isActive}
                    onChange={(e) =>
                      update.mutate({ scheduleId: s.id, isActive: e.target.checked })
                    }
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => remove.mutate({ scheduleId: s.id })}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete schedule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="text-muted-foreground text-sm">
          No schedules yet. Add one so PostPilot knows when to publish.
        </p>
      ) : null}

      {adding ? (
        <ScheduleForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            schedules.refetch();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function ScheduleForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<ScheduleDraft>({
    name: '',
    timezone: BROWSER_TZ,
    daysOfWeek: [1, 2, 3, 4, 5],
    times: ['09:00'],
    platforms: [],
    isActive: true,
  });

  const create = trpc.queue.createSchedule.useMutation({ onSuccess: onSaved });

  const toggleDay = (d: number) =>
    setDraft((p) => ({
      ...p,
      daysOfWeek: p.daysOfWeek.includes(d)
        ? p.daysOfWeek.filter((x) => x !== d)
        : [...p.daysOfWeek, d],
    }));

  const togglePlatform = (pl: Platform) =>
    setDraft((p) => ({
      ...p,
      platforms: p.platforms.includes(pl)
        ? p.platforms.filter((x) => x !== pl)
        : [...p.platforms, pl],
    }));

  const setTime = (i: number, v: string) =>
    setDraft((p) => ({ ...p, times: p.times.map((t, idx) => (idx === i ? v : t)) }));
  const addTime = () => setDraft((p) => ({ ...p, times: [...p.times, '12:00'] }));
  const removeTime = (i: number) =>
    setDraft((p) => ({ ...p, times: p.times.filter((_, idx) => idx !== i) }));

  const canSave = draft.daysOfWeek.length > 0 && draft.times.length > 0 && !create.isPending;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <Input
        value={draft.name}
        onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
        placeholder="Schedule name (optional)"
      />

      <div>
        <p className="mb-1 text-xs font-medium">Days</p>
        <div className="flex flex-wrap gap-1">
          {DAY_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                draft.daysOfWeek.includes(d)
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium">Times</p>
        <div className="space-y-1.5">
          {draft.times.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="time"
                value={t}
                onChange={(e) => setTime(i, e.target.value)}
                className="w-36"
              />
              {draft.times.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeTime(i)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove time"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={addTime}>
            <Plus className="mr-1 h-4 w-4" /> Add time
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium">
          Platforms <span className="text-muted-foreground">(none = all connected)</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {platformSchema.options.map((pl) => (
            <button
              key={pl}
              type="button"
              onClick={() => togglePlatform(pl)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                draft.platforms.includes(pl)
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent border'
              }`}
            >
              {PLATFORM_LABELS[pl]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Timezone</p>
        <Input
          value={draft.timezone}
          onChange={(e) => setDraft((p) => ({ ...p, timezone: e.target.value }))}
          placeholder="e.g. America/New_York"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() =>
            create.mutate({
              name: draft.name.trim() || undefined,
              timezone: draft.timezone.trim() || 'UTC',
              daysOfWeek: draft.daysOfWeek,
              times: draft.times,
              platforms: draft.platforms,
              isActive: draft.isActive,
            })
          }
          disabled={!canSave}
        >
          {create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save schedule
        </Button>
      </div>
    </div>
  );
}
