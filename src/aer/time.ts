// From aer-remote src/device/time.ts (2026-11-04). Adapted: Weekday import path is @/aer/protocol/schedule.
import type { Weekday } from '@/aer/protocol/schedule';

const MS_PER_MIN = 60_000;

/** Offset from UTC, in minutes, that `timeZone` has at the instant `ms`. */
function offsetMinutes(timeZone: string, ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MS_PER_MIN);
}

/**
 * The zone's standard (non-DST) offset east of UTC in minutes, and its DST saving in ms
 * (0 when the zone has no DST that year), judged from the year containing `at`.
 */
export function zoneInfo(
  timeZone: string,
  at: Date,
): { standardOffsetMin: number; dstSavingsMs: number } {
  const year = at.getUTCFullYear();
  const offsets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) =>
    offsetMinutes(timeZone, Date.UTC(year, m, 15, 12)),
  );
  const standardOffsetMin = Math.min(...offsets);
  const maxOffset = Math.max(...offsets);
  return { standardOffsetMin, dstSavingsMs: (maxOffset - standardOffsetMin) * MS_PER_MIN };
}

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface WallClock {
  year: number;
  month: number;
  day: number;
  weekday: Weekday;
  /** Minutes since local midnight. */
  minutes: number;
}

/** The calendar date and time of day that `timeZone` shows at the instant `ms`. */
export function wallClock(ms: number, timeZone: string): WallClock {
  const local = new Date(ms + offsetMinutes(timeZone, ms) * MS_PER_MIN);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: WEEKDAYS[local.getUTCDay()] ?? 'sun',
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/**
 * The instant (ms) at which `timeZone` shows this date and `minutes` since midnight. Out-of-range
 * days or minutes roll over. A time skipped by spring-forward lands just after the gap.
 */
export function fromWallClock(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  minutes: number,
): number {
  const naive = Date.UTC(year, month - 1, day, 0, minutes);
  const first = offsetMinutes(timeZone, naive);
  const guess = naive - first * MS_PER_MIN;
  const second = offsetMinutes(timeZone, guess);
  return second === first ? guess : naive - second * MS_PER_MIN;
}
