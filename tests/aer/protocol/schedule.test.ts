// From aer-remote tests/protocol/schedule.test.ts (2026-11-04). Adapted: imports now use @/aer/protocol.
import {
  decodeScheduleEntry,
  encodeScheduleEntry,
  nextSprayToday,
  repeatCount,
  runsToday,
  sprayCount,
  validateSchedule,
  type Schedule,
} from '@/aer/protocol/schedule';

const weekdays: Schedule = {
  start: { h: 8, m: 0 },
  end: { h: 22, m: 0 },
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  interval: 20,
};

describe('schedule', () => {
  it('encodes weekday schedule', () => {
    expect(Array.from(encodeScheduleEntry(weekdays))).toEqual([0x7c, 8, 0, 42, 20]);
  });

  it('decodes back to the same schedule', () => {
    expect(decodeScheduleEntry(new Uint8Array([0x7c, 8, 0, 42, 20]))).toEqual(weekdays);
  });

  it('encodes weekend-only schedule', () => {
    const s: Schedule = {
      start: { h: 9, m: 30 },
      end: { h: 10, m: 0 },
      days: ['sat', 'sun'],
      interval: 10,
    };
    expect(Array.from(encodeScheduleEntry(s))).toEqual([0x03, 9, 30, 3, 10]);
  });

  it('validates problems', () => {
    expect(validateSchedule({ ...weekdays, start: { h: 22, m: 0 }, end: { h: 8, m: 0 } })).toEqual([
      'endNotAfterStart',
    ]);
    expect(validateSchedule({ ...weekdays, days: [] })).toEqual(['noDays']);
    expect(
      validateSchedule({ ...weekdays, start: { h: 8, m: 0 }, end: { h: 8, m: 5 }, interval: 10 }),
    ).toEqual(['noSprays']);
    expect(validateSchedule(weekdays)).toEqual([]);
  });

  it('flags too many sprays', () => {
    const s: Schedule = { ...weekdays, start: { h: 0, m: 0 }, end: { h: 23, m: 59 }, interval: 10 };
    expect(repeatCount(s)).toBe(143);
    expect(sprayCount(s)).toBe(144);
    expect(validateSchedule(s)).toEqual([]);
  });

  it('counts the spray at the end time when it lands on the interval', () => {
    const at = (sh: number, sm: number, eh: number, em: number, interval: 10 | 20 | 40): number =>
      sprayCount({ ...weekdays, start: { h: sh, m: sm }, end: { h: eh, m: em }, interval });
    expect(at(6, 0, 16, 0, 40)).toBe(16);
    expect(at(18, 50, 19, 50, 20)).toBe(4);
    expect(at(6, 0, 6, 50, 20)).toBe(3);
    expect(at(8, 0, 8, 5, 10)).toBe(0);
    expect(at(9, 0, 8, 0, 10)).toBe(0);
  });

  it('decoded end is start plus count times interval', () => {
    const s: Schedule = {
      start: { h: 8, m: 0 },
      end: { h: 8, m: 25 },
      days: ['mon'],
      interval: 10,
    };
    expect(decodeScheduleEntry(encodeScheduleEntry(s)).end).toEqual({ h: 8, m: 20 });
  });

  it('rejects bad entries', () => {
    expect(() => decodeScheduleEntry(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => encodeScheduleEntry({ ...weekdays, days: [] })).toThrow();
  });
});

describe('nextSprayToday', () => {
  // 2026-10-26 is a Monday.
  const at = (iso: string): Date => new Date(iso);
  const morning: Schedule = {
    start: { h: 8, m: 0 },
    end: { h: 9, m: 0 },
    days: ['mon'],
    interval: 20,
  };
  const evening: Schedule = {
    start: { h: 18, m: 0 },
    end: { h: 19, m: 0 },
    days: ['mon', 'tue'],
    interval: 10,
  };

  it('returns the next spray time today in the given zone', () => {
    // 07:40 in Kolkata (UTC+5:30) on Monday.
    expect(nextSprayToday([morning], at('2026-10-26T02:10:00Z'), 'Asia/Kolkata')).toEqual({
      h: 8,
      m: 0,
    });
    // 08:05 -> next is 08:20.
    expect(nextSprayToday([morning], at('2026-10-26T02:35:00Z'), 'Asia/Kolkata')).toEqual({
      h: 8,
      m: 20,
    });
  });

  it('includes the spray at the end time', () => {
    // 08:45 -> the last spray is at 09:00, the end.
    expect(nextSprayToday([morning], at('2026-10-26T03:15:00Z'), 'Asia/Kolkata')).toEqual({
      h: 9,
      m: 0,
    });
  });

  it('includes a spray exactly now, ignoring seconds', () => {
    expect(nextSprayToday([morning], at('2026-10-26T02:50:45Z'), 'Asia/Kolkata')).toEqual({
      h: 8,
      m: 20,
    });
  });

  it('uses the dispenser zone rather than the phone zone', () => {
    // 2026-10-26T20:00Z is Monday 20:00 UTC but already Tuesday 01:30 in Kolkata.
    expect(nextSprayToday([evening], at('2026-10-26T20:00:00Z'), 'UTC')).toBeNull();
    // Monday 17:00 UTC is Monday 22:30 Kolkata; Monday 12:00 UTC is 17:30 Kolkata -> 18:00.
    expect(nextSprayToday([evening], at('2026-10-26T12:00:00Z'), 'Asia/Kolkata')).toEqual({
      h: 18,
      m: 0,
    });
  });

  it('is null when nothing is left today or the day is not scheduled', () => {
    expect(nextSprayToday([morning], at('2026-10-26T05:00:00Z'), 'Asia/Kolkata')).toBeNull();
    expect(nextSprayToday([morning], at('2026-10-27T02:00:00Z'), 'Asia/Kolkata')).toBeNull();
    expect(nextSprayToday([], at('2026-10-26T02:00:00Z'), 'Asia/Kolkata')).toBeNull();
  });

  it('picks the earliest across schedules', () => {
    expect(nextSprayToday([evening, morning], at('2026-10-26T02:10:00Z'), 'Asia/Kolkata')).toEqual({
      h: 8,
      m: 0,
    });
  });

  it('skips invalid schedules', () => {
    const bad: Schedule = { ...morning, end: { h: 7, m: 0 } };
    expect(nextSprayToday([bad], at('2026-10-26T01:00:00Z'), 'Asia/Kolkata')).toBeNull();
  });

  it('returns null for an unknown time zone', () => {
    expect(nextSprayToday([morning], at('2026-10-26T02:10:00Z'), 'Not/AZone')).toBeNull();
  });
});

describe('runsToday', () => {
  // 2026-10-26 is a Monday.
  const morning: Schedule = {
    start: { h: 8, m: 0 },
    end: { h: 9, m: 0 },
    days: ['mon'],
    interval: 20,
  };

  it('is true on a scheduled day even after the last spray', () => {
    // 10:30 in Kolkata, after the 08:40 spray.
    expect(runsToday([morning], new Date('2026-10-26T05:00:00Z'), 'Asia/Kolkata')).toBe(true);
  });

  it('is false on an unscheduled day, for invalid schedules and for an unknown zone', () => {
    const now = new Date('2026-10-26T05:00:00Z');
    expect(runsToday([morning], new Date('2026-10-27T05:00:00Z'), 'Asia/Kolkata')).toBe(false);
    expect(runsToday([{ ...morning, end: { h: 7, m: 0 } }], now, 'Asia/Kolkata')).toBe(false);
    expect(runsToday([], now, 'Asia/Kolkata')).toBe(false);
    expect(runsToday([morning], now, 'Not/AZone')).toBe(false);
  });
});
