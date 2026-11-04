import { planAlerts } from '@/aer/alerts/plan';
import type { SavedDispenser } from '@/aer/types';
import type { Device } from '@/core';
import { nearlyEmpty } from '../../app/dev/aer-spike';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const NOW = new Date('2026-11-04T10:00:00Z');
const device: Device = {
  id: 'a1',
  kind: 'aer',
  name: 'Hall',
  roomId: 'r',
  order: 0,
  links: [{ kind: 'aer', bleId: 'AA:01', timeZone: 'Asia/Kolkata' }],
};

describe('aer spike: plan a refill alert now', () => {
  it('writes 2190 sprays read now, keeping the rest of the saved dispenser', () => {
    const saved: SavedDispenser = {
      id: 'a1',
      bleId: 'AA:01',
      name: 'Hall',
      homeTimeZone: 'Asia/Kolkata',
      clockSet: true,
      lastStatus: {
        batteryMv: 2900,
        firmware: '2.1.4',
        autoSpray: 20,
        scheduleRunning: false,
        spraysSinceRefill: 100,
        at: '2026-11-01T00:00:00Z',
      },
    };
    const next = nearlyEmpty(saved, device, NOW);
    expect(next).toEqual({
      ...saved,
      lastStatus: { ...saved.lastStatus, spraysSinceRefill: 2190, at: NOW.toISOString() },
    });
    const kinds = planAlerts({ dispenser: next, now: NOW, phoneTimeZone: 'Asia/Kolkata' }).map(
      (p) => p.kind,
    );
    expect(kinds).toEqual(expect.arrayContaining(['refillLow', 'refillOut']));
  });

  it('builds the dispenser from the device when it was never read', () => {
    const next = nearlyEmpty(null, device, NOW);
    expect(next).toMatchObject({
      id: 'a1',
      bleId: 'AA:01',
      name: 'Hall',
      homeTimeZone: 'Asia/Kolkata',
      lastStatus: { spraysSinceRefill: 2190, at: NOW.toISOString() },
    });
  });
});
