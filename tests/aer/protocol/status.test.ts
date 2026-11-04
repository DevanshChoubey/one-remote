// From aer-remote tests/protocol/status.test.ts (2026-11-04). Adapted: imports now use @/aer/protocol.
import { toReply } from '@/aer/protocol/replies';
import {
  batteryPercent,
  isBatteryTooLow,
  parseStatus,
  refillPercent,
  REFILL_SPRAYS,
} from '@/aer/protocol/status';

const reply = (body: Record<string, unknown>): NonNullable<ReturnType<typeof toReply>> => {
  const r = toReply({ mT: 157, mN: 9, ack: 200, ...body } as never);
  if (!r) throw new Error('bad reply');
  return r;
};

describe('status', () => {
  it('parses a status reply', () => {
    const r = reply({
      bV: 2506,
      fV: '3.0.6-T1',
      cS: 122,
      sC: { sn: [1, 2, 0, 0], sc: [3, 0, 0], bn: [0, 0, 1] },
    });
    expect(parseStatus(r)).toEqual({
      batteryMv: 2506,
      firmware: '3.0.6-T1',
      autoSpray: null,
      scheduleRunning: true,
      spraysSinceRefill: 7,
    });
  });

  it('maps auto-spray states, which are only 11x', () => {
    const f = (cS: number): unknown => parseStatus(reply({ bV: 2600, cS })).autoSpray;
    expect([111, 0, 112, 113, 114, 121, 122, 123, 131, 132, 133, 999].map(f)).toEqual([
      null,
      null,
      10,
      20,
      40,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('reads 12x as a schedule window running', () => {
    const f = (cS: number): unknown => parseStatus(reply({ bV: 2600, cS })).scheduleRunning;
    expect([121, 122, 123, 111, 112, 0, 131, 999].map(f)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('handles absent fields and map counters', () => {
    expect(parseStatus(reply({ bV: 2600 }))).toEqual({
      batteryMv: 2600,
      firmware: '',
      autoSpray: null,
      scheduleRunning: false,
      spraysSinceRefill: 0,
    });
    expect(
      parseStatus(reply({ bV: 2600, sC: { sn: { a: 2, b: [3, 'x'] }, z: 'q' } })).spraysSinceRefill,
    ).toBe(5);
  });

  it('throws when bV is missing or not a number', () => {
    expect(() => parseStatus(reply({}))).toThrow('status reply missing bV');
    expect(() => parseStatus(reply({ bV: 'x' }))).toThrow('status reply missing bV');
  });

  it('computes battery and refill', () => {
    expect(batteryPercent(3100)).toBe(100);
    expect(batteryPercent(2750)).toBe(50);
    expect(batteryPercent(2300)).toBe(0);
    expect(batteryPercent(3500)).toBe(100);
    expect(isBatteryTooLow(2399)).toBe(true);
    expect(isBatteryTooLow(2400)).toBe(false);
    expect(REFILL_SPRAYS).toBe(2200);
    expect(refillPercent(1100)).toBe(50);
    expect(refillPercent(5000)).toBe(0);
    expect(refillPercent(-5)).toBe(100);
  });
});
