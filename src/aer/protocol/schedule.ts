// From aer-remote src/protocol/schedule.ts (2026-11-04). Adapted: none.
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Interval = 10 | 20 | 40;
export interface TimeOfDay {
  h: number;
  m: number;
}
export interface Schedule {
  start: TimeOfDay;
  end: TimeOfDay;
  days: Weekday[];
  interval: Interval;
}
export type ScheduleProblem = 'endNotAfterStart' | 'noDays' | 'noSprays' | 'tooManySprays';

export const MAX_SCHEDULES = 10;

const DAY_BITS: [Weekday, number][] = [
  ['mon', 0x40],
  ['tue', 0x20],
  ['wed', 0x10],
  ['thu', 0x08],
  ['fri', 0x04],
  ['sat', 0x02],
  ['sun', 0x01],
];

const minutes = (t: TimeOfDay): number => t.h * 60 + t.m;

/** The repeat count the device stores: whole intervals between start and end. */
export function repeatCount(s: Schedule): number {
  const window = minutes(s.end) - minutes(s.start);
  return window > 0 ? Math.floor(window / s.interval) : 0;
}

/**
 * Sprays a day: at start, every interval after it, and at the end when it lands on an interval
 * (06:00-16:00 every 40 min is 16 sprays). Zero when the device would store no repeats.
 */
export function sprayCount(s: Schedule): number {
  const repeats = repeatCount(s);
  return repeats > 0 ? repeats + 1 : 0;
}

export function validateSchedule(s: Schedule): ScheduleProblem[] {
  const problems: ScheduleProblem[] = [];
  if (minutes(s.end) <= minutes(s.start)) problems.push('endNotAfterStart');
  if (s.days.length === 0) problems.push('noDays');
  if (minutes(s.end) > minutes(s.start)) {
    const count = repeatCount(s);
    if (count === 0) problems.push('noSprays');
    else if (count > 255) problems.push('tooManySprays');
  }
  return problems;
}

export function encodeScheduleEntry(s: Schedule): Uint8Array {
  const problems = validateSchedule(s);
  if (problems.length > 0) throw new Error(`Invalid schedule: ${problems.join(', ')}`);
  let mask = 0;
  for (const [day, bit] of DAY_BITS) if (s.days.includes(day)) mask |= bit;
  return new Uint8Array([mask, s.start.h, s.start.m, repeatCount(s), s.interval]);
}

export function decodeScheduleEntry(b: Uint8Array): Schedule {
  if (b.length !== 5) throw new Error('Schedule entry must be 5 bytes');
  const [mask = 0, h = 0, m = 0, count = 0, interval = 0] = b;
  if (interval !== 10 && interval !== 20 && interval !== 40) {
    throw new Error('Unknown schedule interval');
  }
  const endMin = h * 60 + m + count * interval;
  return {
    start: { h, m },
    end: { h: Math.floor(endMin / 60), m: endMin % 60 },
    days: DAY_BITS.filter(([, bit]) => (mask & bit) !== 0).map(([day]) => day),
    interval,
  };
}

const WEEKDAY_BY_SHORT: Record<string, Weekday> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

/** Today's weekday and minute of the day in `timeZone`, or null for an unknown zone. */
function localDayAndMinute(now: Date, timeZone: string): { today: Weekday; nowMin: number } | null {
  // Once a year the spring-forward gap or the repeated fall-back hour may show a time that does not
  // exist or appears twice; that is acceptable here.
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hourCycle: 'h23',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(now);
  } catch (e) {
    if (e instanceof RangeError) return null; // unknown time zone
    throw e;
  }
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const today = WEEKDAY_BY_SHORT[part('weekday')];
  if (!today) return null;
  return { today, nowMin: Number(part('hour')) * 60 + Number(part('minute')) };
}

const runsOn = (s: Schedule, day: Weekday): boolean =>
  s.days.includes(day) && validateSchedule(s).length === 0;

/** Whether any valid schedule has sprays on today's date in `timeZone`, past or still to come. */
export function runsToday(schedules: Schedule[], now: Date, timeZone: string): boolean {
  const local = localDayAndMinute(now, timeZone);
  return local !== null && schedules.some((s) => runsOn(s, local.today));
}

/**
 * The next spray at or after `now` (to the minute) on today's date in `timeZone`, or null when
 * none is left. Sprays run at start, start + interval, ... for `sprayCount` sprays.
 */
export function nextSprayToday(
  schedules: Schedule[],
  now: Date,
  timeZone: string,
): TimeOfDay | null {
  const local = localDayAndMinute(now, timeZone);
  if (!local) return null;
  const { today, nowMin } = local;
  let best: number | null = null;
  for (const s of schedules) {
    if (!runsOn(s, today)) continue;
    const count = sprayCount(s);
    for (let k = 0; k < count; k += 1) {
      const at = minutes(s.start) + k * s.interval;
      if (at >= nowMin) {
        if (best === null || at < best) best = at;
        break;
      }
    }
  }
  return best === null ? null : { h: Math.floor(best / 60), m: best % 60 };
}
