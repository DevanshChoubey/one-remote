// From aer-remote src/alerts/plan.ts (2026-11-04). Adapted: imports point at @/aer; groupOf added.
import { fromWallClock, wallClock } from '@/aer/time';
import { batteryPercent, isBatteryTooLow, refillPercent } from '@/aer/protocol/status';
import { sprayCount, validateSchedule } from '@/aer/protocol/schedule';
import type { Weekday } from '@/aer/protocol/schedule';
import type { SavedDispenser } from '@/aer/types';
import type { AlertGroup } from './types';

export type AlertKind = 'refillLow' | 'refillOut' | 'batteryLow' | 'batteryFlat' | 'checkIn';

export interface PlannedAlert {
  key: string;
  dispenserId: string;
  kind: AlertKind;
  /** Delivery time, already inside the phone's delivery window. */
  at: Date;
}

export interface PlanInput {
  dispenser: SavedDispenser;
  now: Date;
  phoneTimeZone: string;
}

const MS_PER_DAY = 86_400_000;
const WINDOW_START_MIN = 9 * 60;
const WINDOW_END_MIN = 21 * 60;
const CHECK_IN_DAYS = 14;
const MAX_DAYS_AHEAD = 365;
const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const alertKey = (dispenserId: string, kind: AlertKind): string => `${dispenserId}:${kind}`;

/**
 * `at`, or now if that has passed, moved to 09:00 phone time when it falls outside the
 * 09:00-21:00 window (the next 09:00 if it is already past 21:00).
 */
export function intoWindow(at: Date, now: Date, phoneTimeZone: string): Date {
  const ms = Math.max(at.getTime(), now.getTime());
  const w = wallClock(ms, phoneTimeZone);
  if (w.minutes >= WINDOW_START_MIN && w.minutes < WINDOW_END_MIN) return new Date(ms);
  const dayOffset = w.minutes < WINDOW_START_MIN ? 0 : 1;
  return new Date(
    fromWallClock(phoneTimeZone, w.year, w.month, w.day + dayOffset, WINDOW_START_MIN),
  );
}

/**
 * Sprays on a calendar day from minute `fromMin` on (0 for a whole day), with auto-spray on while
 * `autoOn`. A schedule window starting stops auto-spray for good, so `autoOn` comes back false then.
 */
function spraysOnDay(
  dispenser: SavedDispenser,
  weekday: Weekday,
  fromMin: number,
  autoOn: boolean,
): { sprays: number; autoOn: boolean } {
  let sprays = 0;
  let firstStart: number | null = null;
  for (const s of dispenser.schedules?.list ?? []) {
    if (!s.days.includes(weekday) || validateSchedule(s).length > 0) continue;
    const start = s.start.h * 60 + s.start.m;
    if (start >= fromMin && (firstStart === null || start < firstStart)) firstStart = start;
    for (let k = 0; k < sprayCount(s); k += 1) {
      if (start + k * s.interval >= fromMin) sprays += 1;
    }
  }
  const auto = dispenser.lastStatus?.autoSpray;
  if (!autoOn || !auto) return { sprays, autoOn: false };
  sprays += Math.floor(((firstStart ?? 1440) - fromMin) / auto);
  return { sprays, autoOn: firstStart === null };
}

/** Plans one alert per kind that applies to the dispenser's last reading. */
export function planAlerts({ dispenser, now, phoneTimeZone }: PlanInput): PlannedAlert[] {
  const status = dispenser.lastStatus;
  if (!status) return [];
  const readAt = new Date(status.at);
  const planned: PlannedAlert[] = [];
  const add = (kind: AlertKind, at: Date): void => {
    planned.push({
      key: alertKey(dispenser.id, kind),
      dispenserId: dispenser.id,
      kind,
      at: intoWindow(at, now, phoneTimeZone),
    });
  };

  // Refill: walk calendar days in the dispenser's zone, starting on the day of the reading.
  const home = wallClock(readAt.getTime(), dispenser.homeTimeZone);
  const limit = readAt.getTime() + MAX_DAYS_AHEAD * MS_PER_DAY;
  const crossings: [AlertKind, (percent: number) => boolean, boolean][] = [
    ['refillLow', (p) => p < 10, false],
    ['refillOut', (p) => p === 0, false],
  ];
  let count = status.spraysSinceRefill;
  let autoOn = status.autoSpray !== null;
  for (const c of crossings) c[2] = c[1](refillPercent(count));
  for (const [kind, , done] of crossings) if (done) add(kind, now);
  for (let day = 0; day <= MAX_DAYS_AHEAD + 1 && crossings.some((c) => !c[2]); day += 1) {
    const date = new Date(Date.UTC(home.year, home.month - 1, home.day + day));
    const weekday = WEEKDAYS[date.getUTCDay()] ?? 'sun';
    const today = spraysOnDay(dispenser, weekday, day === 0 ? home.minutes : 0, autoOn);
    count += today.sprays;
    autoOn = today.autoOn;
    for (const c of crossings) {
      if (c[2] || !c[1](refillPercent(count))) continue;
      c[2] = true;
      const at = fromWallClock(
        phoneTimeZone,
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        WINDOW_START_MIN,
      );
      if (at <= limit) add(c[0], new Date(at));
    }
  }

  if (batteryPercent(status.batteryMv) < 10) add('batteryLow', now);
  if (isBatteryTooLow(status.batteryMv)) add('batteryFlat', now);
  add('checkIn', new Date(readAt.getTime() + CHECK_IN_DAYS * MS_PER_DAY));
  return planned;
}

/** The switch that governs each kind of alert. */
export function groupOf(kind: AlertKind): AlertGroup {
  if (kind === 'refillLow' || kind === 'refillOut') return 'refill';
  if (kind === 'batteryLow' || kind === 'batteryFlat') return 'battery';
  return 'checkIn';
}
