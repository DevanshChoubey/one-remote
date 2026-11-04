// From aer-remote tests/alerts/plan.test.ts (2026-11-04). Adapted: imports, bleId/storage keys/app name renamed for One Remote, switches per group.
import { alertKey, intoWindow, planAlerts } from '@/aer/alerts/plan';
import type { Schedule } from '@/aer/protocol/schedule';
import type { SavedDispenser } from '@/aer/types';

const KOLKATA = 'Asia/Kolkata';
const LONDON = 'Europe/London';

const everyDay: Schedule = {
  start: { h: 8, m: 0 },
  end: { h: 16, m: 0 },
  days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  interval: 20,
};

function dispenser(
  status: {
    at: string;
    spraysSinceRefill?: number;
    batteryMv?: number;
    autoSpray?: 10 | 20 | 40 | null;
  },
  schedules: Schedule[] = [],
  zone = KOLKATA,
): SavedDispenser {
  return {
    id: 'abc',
    bleId: 'AA:BB',
    name: 'Hall',
    homeTimeZone: zone,
    lastStatus: {
      at: status.at,
      batteryMv: status.batteryMv ?? 3000,
      firmware: '1',
      autoSpray: status.autoSpray ?? null,
      scheduleRunning: false,
      spraysSinceRefill: status.spraysSinceRefill ?? 0,
    },
    schedules: { list: schedules, at: status.at },
  };
}

const find = (alerts: ReturnType<typeof planAlerts>, kind: string) =>
  alerts.find((a) => a.kind === kind);
const iso = (d: Date | undefined) => d?.toISOString();

describe('planAlerts', () => {
  const reading = '2026-11-02T10:00:00+05:30';

  it('no reading, no alerts', () => {
    const d: SavedDispenser = { id: 'abc', bleId: 'AA:BB', name: 'Hall', homeTimeZone: KOLKATA };
    expect(planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA })).toEqual(
      [],
    );
  });

  it('refill low lands on the morning of the crossing day', () => {
    const d = dispenser({ at: reading, spraysSinceRefill: 1900 }, [everyDay]);
    const alerts = planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA });
    expect(iso(find(alerts, 'refillLow')?.at)).toBe(
      new Date('2026-11-05T09:00:00+05:30').toISOString(),
    );
    expect(find(alerts, 'refillLow')?.key).toBe('abc:refillLow');
  });

  it('refill out follows', () => {
    const d = dispenser({ at: reading, spraysSinceRefill: 1900 }, [everyDay]);
    const alerts = planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA });
    // 25 sprays a day, the one at 16:00 included: 1919, 1944, 1969, ..., 2169, 2194 (0%).
    expect(iso(find(alerts, 'refillOut')?.at)).toBe(
      new Date('2026-11-13T09:00:00+05:30').toISOString(),
    );
  });

  it('auto-spray only', () => {
    const d = dispenser({ at: reading, spraysSinceRefill: 1900, autoSpray: 40 });
    const alerts = planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA });
    expect(find(alerts, 'refillLow')).toBeDefined();
  });

  it('auto-spray stops for good when the next schedule window starts', () => {
    const wednesday: Schedule = {
      start: { h: 8, m: 0 },
      end: { h: 9, m: 0 },
      days: ['wed'],
      interval: 20,
    };
    const d = dispenser({ at: reading, spraysSinceRefill: 1900, autoSpray: 40 }, [wednesday]);
    const alerts = planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA });
    // Auto: 21 on Monday from 10:00, 36 on Tuesday, 12 on Wednesday before 08:00, then none. The
    // schedule adds 4 each Wednesday: 1921, 1957, 1973, then 1977, ..., 1993 (9%) on 9 December.
    expect(iso(find(alerts, 'refillLow')?.at)).toBe(
      new Date('2026-12-09T09:00:00+05:30').toISOString(),
    );
  });

  it('a schedule window that ended before the reading does not stop auto-spray', () => {
    const early: Schedule = {
      start: { h: 6, m: 0 },
      end: { h: 7, m: 0 },
      days: ['mon'],
      interval: 20,
    };
    const d = dispenser({ at: reading, spraysSinceRefill: 1900, autoSpray: 40 }, [early]);
    const alerts = planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA });
    // 1921 on Monday, 1957 on Tuesday, 1993 (9%) on Wednesday.
    expect(iso(find(alerts, 'refillLow')?.at)).toBe(
      new Date('2026-11-04T09:00:00+05:30').toISOString(),
    );
  });

  it('zero rate schedules no refill alert', () => {
    const d = dispenser({ at: reading, spraysSinceRefill: 1900 });
    const alerts = planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA });
    expect(alerts.map((a) => a.kind)).toEqual(['checkIn']);
  });

  it('already below 10%', () => {
    const d = dispenser({ at: reading, spraysSinceRefill: 2000 }, [everyDay]);
    const afternoon = new Date('2026-11-02T14:00:00+05:30');
    const a = planAlerts({ dispenser: d, now: afternoon, phoneTimeZone: KOLKATA });
    expect(find(a, 'refillLow')?.at.getTime()).toBe(afternoon.getTime());
    const night = new Date('2026-11-02T23:00:00+05:30');
    const b = planAlerts({ dispenser: d, now: night, phoneTimeZone: KOLKATA });
    expect(iso(find(b, 'refillLow')?.at)).toBe(new Date('2026-11-03T09:00:00+05:30').toISOString());
  });

  it('battery low and flat', () => {
    const now = new Date('2026-11-02T12:00:00+05:30');
    const low = planAlerts({
      dispenser: dispenser({ at: reading, batteryMv: 2435 }),
      now,
      phoneTimeZone: KOLKATA,
    });
    expect(find(low, 'batteryLow')?.at.getTime()).toBe(now.getTime());
    expect(find(low, 'batteryFlat')).toBeUndefined();
    const flat = planAlerts({
      dispenser: dispenser({ at: reading, batteryMv: 2300 }),
      now,
      phoneTimeZone: KOLKATA,
    });
    expect(find(flat, 'batteryFlat')?.at.getTime()).toBe(now.getTime());
    const fine = planAlerts({
      dispenser: dispenser({ at: reading, batteryMv: 2750 }),
      now,
      phoneTimeZone: KOLKATA,
    });
    expect(find(fine, 'batteryLow')).toBeUndefined();
    expect(find(fine, 'batteryFlat')).toBeUndefined();
  });

  it('check-in 14 days after the reading', () => {
    const d = dispenser({ at: '2026-11-02T22:00:00+05:30' });
    const alerts = planAlerts({
      dispenser: d,
      now: new Date('2026-11-02T22:00:00+05:30'),
      phoneTimeZone: KOLKATA,
    });
    // 14 days on is 22:00, outside the window, so it moves to the next 09:00.
    expect(iso(find(alerts, 'checkIn')?.at)).toBe(
      new Date('2026-11-17T09:00:00+05:30').toISOString(),
    );
  });

  it('crossing across a DST change', () => {
    const at = '2026-10-24T10:00:00Z';
    const d = dispenser({ at, spraysSinceRefill: 1700, autoSpray: 10 }, [], LONDON);
    const alerts = planAlerts({ dispenser: d, now: new Date(at), phoneTimeZone: LONDON });
    expect(iso(find(alerts, 'refillLow')?.at)).toBe('2026-10-26T09:00:00.000Z');
  });

  it('beyond 365 days plans nothing', () => {
    const slow: Schedule = {
      start: { h: 8, m: 0 },
      end: { h: 8, m: 20 },
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      interval: 20,
    };
    const d = dispenser({ at: reading, spraysSinceRefill: 0 }, [slow]);
    const alerts = planAlerts({ dispenser: d, now: new Date(reading), phoneTimeZone: KOLKATA });
    expect(find(alerts, 'refillLow')).toBeUndefined();
    expect(find(alerts, 'refillOut')).toBeUndefined();
  });

  it('keys are stable', () => {
    expect(alertKey('abc', 'refillLow')).toBe('abc:refillLow');
  });
});

describe('intoWindow', () => {
  it('keeps a time inside the window', () => {
    const at = new Date('2026-11-02T15:00:00+05:30');
    expect(intoWindow(at, new Date('2026-11-01T00:00:00Z'), KOLKATA)).toEqual(at);
  });

  it('moves early morning to 09:00 the same day', () => {
    const at = new Date('2026-11-02T06:00:00+05:30');
    expect(iso(intoWindow(at, new Date('2026-11-01T00:00:00Z'), KOLKATA))).toBe(
      new Date('2026-11-02T09:00:00+05:30').toISOString(),
    );
  });
});
