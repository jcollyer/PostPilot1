import { DateTime } from 'luxon';
import type { Platform } from '@postpilot/db';

import { HORIZON_DAYS, MAX_SLOTS } from './config';

export interface ScheduleRule {
  id: string;
  timezone: string;
  daysOfWeek: number[]; // 0 = Sunday .. 6 = Saturday
  times: string[]; // "HH:MM" 24h, interpreted in `timezone`
  platforms: Platform[]; // explicit targets; [] means "all connected" (resolved later)
}

export interface Slot {
  at: Date; // UTC instant
  scheduleId: string;
  platforms: Platform[];
}

/** Map luxon weekday (1=Mon..7=Sun) to our convention (0=Sun..6=Sat). */
function toOurWeekday(luxonWeekday: number): number {
  return luxonWeekday === 7 ? 0 : luxonWeekday;
}

/**
 * Expand active schedules into concrete UTC slot instants over the horizon,
 * each tagged with its schedule + target platforms. Timezone-aware (DST-safe
 * via luxon). Merged across schedules, sorted ascending, capped at MAX_SLOTS.
 */
export function generateSlots(
  schedules: ScheduleRule[],
  from: Date,
  opts?: { horizonDays?: number; max?: number },
): Slot[] {
  const horizonDays = opts?.horizonDays ?? HORIZON_DAYS;
  const max = opts?.max ?? MAX_SLOTS;
  const slots: Slot[] = [];

  for (const schedule of schedules) {
    if (schedule.daysOfWeek.length === 0 || schedule.times.length === 0) continue;
    const zone = schedule.timezone || 'UTC';
    let cursor = DateTime.fromJSDate(from).setZone(zone);
    if (!cursor.isValid) cursor = DateTime.fromJSDate(from).setZone('UTC');
    const startOfDay = cursor.startOf('day');

    for (let d = 0; d <= horizonDays; d++) {
      const day = startOfDay.plus({ days: d });
      if (!schedule.daysOfWeek.includes(toOurWeekday(day.weekday))) continue;

      for (const time of schedule.times) {
        const [h, m] = time.split(':').map(Number);
        if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) continue;
        const at = day.set({ hour: h, minute: m, second: 0, millisecond: 0 }).toJSDate();
        if (at.getTime() > from.getTime()) {
          slots.push({ at, scheduleId: schedule.id, platforms: schedule.platforms });
        }
      }
    }
  }

  slots.sort((a, b) => a.at.getTime() - b.at.getTime());
  return slots.slice(0, max);
}
