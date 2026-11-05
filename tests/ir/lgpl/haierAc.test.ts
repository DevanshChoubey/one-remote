import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  haier176AcSignal,
  haier176Bytes,
  haierAcSignal,
  haierBytes,
  haierBytesToSignal,
} from '@/ir/lgpl/haierAc';
import { sumBytes } from '@/ir/lgpl/irsend';
import {
  HAIER_SEND_TEST,
  HAIER_SEND_TEST_STATE,
  HAIER_SEND_ZERO,
  HAIER_YRW02_REAL_STATE4,
} from './haierAc.fixtures';
import { hex, timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });
const withSum = (raw: number[], at: number) => {
  raw[at] = sumBytes(raw, 0, at);
  return raw;
};

describe('Haier (HAIER_AC)', () => {
  it('sends raw states with the upstream timings (SendDataOnly)', () => {
    expect(timing(haierBytesToSignal(new Array(9).fill(0)))).toBe(upstream(HAIER_SEND_ZERO));
    expect(timing(haierBytesToSignal(HAIER_SEND_TEST_STATE))).toBe(upstream(HAIER_SEND_TEST));
  });

  it('builds the SendDataOnly state, apart from its clock and off-timer hours', () => {
    const real = [...HAIER_SEND_TEST_STATE];
    real[3] = 0x00; // CurrMins 1 in the vector; we send no clock
    real[4] = 12; // OffHours: stateReset's default initial state
    withSum(real, 8);
    const s = on({ mode: 'cool', setpoint: 16, fan: 1, swing: false, sleep: false });
    expect(hex(haierBytes(s))).toEqual(hex(real));
  });

  it('maps like IRac::haier (Command, OperatingMode, FanSpeed, SwingV, sleep)', () => {
    const raw = haierBytes(on({ mode: 'dry', setpoint: 21, fan: 3, swing: true, sleep: true }));
    expect((raw[1] ?? 0) & 0xf).toBe(1); // kHaierAcCmdOn
    expect((raw[1] ?? 0) >> 4).toBe(21 - 16);
    expect((raw[6] ?? 0) >> 5).toBe(2); // kHaierAcDry
    expect((raw[5] ?? 0) >> 6).toBe(1); // high is stored as 1
    expect((raw[2] ?? 0) >> 6).toBe(3); // kHaierAcSwingVChg
    expect(((raw[7] ?? 0) >> 6) & 1).toBe(1); // Sleep
    expect((haierBytes({ ...on(), power: false })[1] ?? 0) & 0xf).toBe(0); // kHaierAcCmdOff
    expect(((haierBytes(on({ mode: 'fan' }))[6] ?? 0) >> 5) & 7).toBe(4);
    expect(((haierBytes(on({ fan: 'auto' }))[5] ?? 0) >> 6) & 3).toBe(0);
    expect(haierAcSignal(on()).pattern.slice(0, 4)).toEqual([3000, 3000, 3000, 4300]);
  });
});

describe('Haier (HAIER_AC_YRW02 and HAIER_AC176)', () => {
  it('builds the real YR-W02 state 4, apart from health, button and off-timer hours', () => {
    const real = [...HAIER_YRW02_REAL_STATE4];
    real[3] = (real[3] ?? 0) & ~0x02; // Health: IRac sends the filter off
    real[5] = (real[5] ?? 0) & ~0x1f; // OffTimerHrs 8 in the capture
    real[12] = 0x05; // Button: IRac ends with Power
    withSum(real, 13);
    const s = on({ mode: 'cool', setpoint: 25, fan: 'auto', swing: true, sleep: true });
    expect(hex(haier176Bytes(s).slice(0, 14))).toEqual(hex(real));
  });

  it('maps like IRac::haierYrwo2 / haier176 (Fan, SwingV, Power)', () => {
    const raw = haier176Bytes(on({ mode: 'fan', setpoint: 30, fan: 3, swing: false }));
    expect((raw[7] ?? 0) >> 5).toBe(0b110); // kHaierAcYrw02Fan
    expect((raw[1] ?? 0) >> 4).toBe(14);
    expect((raw[5] ?? 0) >> 5).toBe(0b001); // kHaierAcYrw02FanHigh
    expect((raw[16] ?? 0) >> 6).toBe(0b01); // Fan2
    expect((raw[1] ?? 0) & 0xf).toBe(0);
    expect(raw[14]).toBe(0xb7);
    expect(raw[21]).toBe(sumBytes(raw, 14, 21));
    expect(((haier176Bytes({ ...on(), power: false })[4] ?? 0) >> 6) & 1).toBe(0);
    expect(((haier176Bytes(on({ fan: 'auto' }))[16] ?? 0) >> 6) & 3).toBe(0);
  });

  it('sends 14 bytes for YR-W02 and 22 for V9014557', () => {
    const header = 4;
    const footer = 2;
    expect(haier176AcSignal(on(), 'yrw02').pattern).toHaveLength(header + 14 * 16 + footer);
    expect(haier176AcSignal(on(), 'v9014557a').pattern).toHaveLength(header + 22 * 16 + footer);
  });
});
