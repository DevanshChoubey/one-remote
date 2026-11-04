import { aerProblem, AerError } from '@/services';
import type { AerProblem, AerSchedule, AerView } from '@/services';
import { t } from '@/i18n';
import {
  daysLabel,
  formatNextSpray,
  formatTime,
  formatTimeParts,
  formatWhen,
  offsetLabel,
  PROBLEM_COPY,
  problemCopy,
  zoneLabel,
} from '@/screens/aer/format';

describe('formatTime', () => {
  it('writes 12-hour lowercase', () => {
    expect(formatTime({ h: 18, m: 0 })).toBe('6:00 pm');
    expect(formatTime({ h: 0, m: 5 })).toBe('12:05 am');
    expect(formatTime({ h: 12, m: 30 })).toBe('12:30 pm');
    expect(formatTimeParts({ h: 18, m: 0 })).toEqual({ hm: '6:00', ap: 'pm' });
  });
});

describe('formatWhen', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  it('buckets the age', () => {
    expect(formatWhen('2026-11-04T11:59:40Z', now)).toBe('just now');
    expect(formatWhen('2026-11-04T11:55:00Z', now)).toBe('5 min ago');
    expect(formatWhen('2026-11-04T09:00:00Z', now)).toBe('3 h ago');
    expect(formatWhen('2026-11-02T12:00:00Z', now)).toBe('2 d ago');
  });
});

describe('daysLabel', () => {
  it('names the common sets and lists the rest', () => {
    expect(daysLabel(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('Weekdays');
    expect(daysLabel(['sun', 'sat'])).toBe('Weekends');
    expect(daysLabel(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).toBe('Every day');
    expect(daysLabel(['mon', 'wed'])).toBe('Mon, Wed');
  });
});

describe('zones', () => {
  it('labels a zone', () => {
    expect(zoneLabel('Asia/Kolkata')).toBe('India · Kolkata');
    expect(zoneLabel('America/Argentina/Buenos_Aires')).toBe('America · Buenos Aires');
  });
  it('labels the standard offset', () => {
    const at = new Date('2026-11-04T00:00:00Z');
    expect(offsetLabel('Asia/Kolkata', at)).toBe('UTC+5:30');
    expect(offsetLabel('UTC', at)).toBe('UTC+0');
    expect(offsetLabel('America/New_York', at)).toBe('UTC-5');
  });
});

describe('formatNextSpray', () => {
  const schedule: AerSchedule = {
    start: { h: 18, m: 0 },
    end: { h: 22, m: 0 },
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    interval: 40,
  };
  const view: AerView = {
    deviceId: 'd1',
    schedules: { list: [schedule], at: '2026-11-04T11:00:00Z' },
  };
  const now = new Date('2026-11-04T12:00:00Z');

  it('uses the home zone', () => {
    expect(formatNextSpray(view, 'Asia/Kolkata', now)).toBe('Next spray 6:00 pm');
    expect(formatNextSpray(view, 'Europe/London', now)).toBe('Next spray 6:00 pm');
    expect(formatNextSpray(view, 'Asia/Tokyo', now)).toBe('Next spray 9:20 pm');
  });

  it('falls back to auto spray, done for today, or nothing planned', () => {
    const status = {
      batteryMv: 3000,
      firmware: '1',
      autoSpray: 20 as const,
      scheduleRunning: false,
      spraysSinceRefill: 0,
      at: '2026-11-04T11:00:00Z',
    };
    expect(
      formatNextSpray({ ...view, status }, 'Asia/Tokyo', new Date('2026-11-04T14:00:00Z')),
    ).toBe('Auto spray every 20 minutes');
    expect(formatNextSpray(view, 'Asia/Tokyo', new Date('2026-11-04T14:00:00Z'))).toBe(
      'Done for today',
    );
    expect(formatNextSpray({ deviceId: 'd1' }, 'Asia/Tokyo', now)).toBe('No spray planned today');
  });
});

describe('problem copy', () => {
  const all: AerProblem[] = [
    'btoff',
    'denied',
    'away',
    'busy',
    'flat',
    'notAer',
    'scheduleRunning',
    'timeZone',
    'failed',
  ];
  it('has a title and a sub for every problem', () => {
    expect(Object.keys(PROBLEM_COPY).sort()).toEqual([...all].sort());
    for (const p of all) {
      expect(t(PROBLEM_COPY[p].title).length).toBeGreaterThan(0);
      expect(t(PROBLEM_COPY[p].sub).length).toBeGreaterThan(0);
    }
  });
  it('words an error through aerProblem', () => {
    const e = new AerError('bluetoothOff');
    expect(aerProblem(e)).toBe('btoff');
    expect(problemCopy(e).title).toBe('Bluetooth is off');
    expect(problemCopy(new Error('x')).title).toBe('Something went wrong');
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));
