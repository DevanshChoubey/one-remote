import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  WHIRLPOOL_CAPS,
  whirlpoolAcSignal,
  whirlpoolBytes,
  whirlpoolBytesToSignal,
  whirlpoolChecksum,
} from '@/ir/lgpl/whirlpoolAc';
import {
  WHIRLPOOL_MESSAGE_CONSTRUCTION,
  WHIRLPOOL_SEND_DATA_ONLY,
  WHIRLPOOL_SEND_DATA_ONLY_STATE,
} from './whirlpoolAc.fixtures';
import { hex, timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });

describe('Whirlpool (WHIRLPOOL_AC)', () => {
  it('sends a raw state in three sections with the upstream timings (SendDataOnly)', () => {
    expect(timing(whirlpoolBytesToSignal(WHIRLPOOL_SEND_DATA_ONLY_STATE))).toBe(
      upstream(WHIRLPOOL_SEND_DATA_ONLY),
    );
  });

  it('computes both XOR checksums (MessageConstruction)', () => {
    const raw = [...WHIRLPOOL_MESSAGE_CONSTRUCTION];
    raw[13] = raw[20] = 0;
    whirlpoolChecksum(raw);
    expect(hex(raw)).toEqual(hex(WHIRLPOOL_MESSAGE_CONSTRUCTION));
  });

  it('matches the real capture apart from its clock, timers and button (MessageConstruction)', () => {
    const real = [...WHIRLPOOL_MESSAGE_CONSTRUCTION];
    real[6] = (real[6] ?? 0) & ~0x1f; // ClockHours
    real[7] = real[9] = real[10] = real[11] = 0; // ClockMins, timers and their enables
    real[8] = (real[8] ?? 0) & ~0x1f; // OffHours
    real[15] = 0x01; // the command IRac leaves: Power
    whirlpoolChecksum(real);
    const s = on({ mode: 'dry', setpoint: 25, fan: 'auto', swing: false, sleep: false });
    expect(hex(whirlpoolBytes(s, 'dg11j13a', false))).toEqual(hex(real));
  });

  it('maps like IRac::whirlpool (TestIRac.Whirlpool: Auto, 21C, sleep forces Low)', () => {
    const raw = whirlpoolBytes(
      on({ mode: 'auto', setpoint: 21, fan: 2, swing: true, sleep: true }),
      'dg11j13a',
      true,
    );
    expect((raw[3] ?? 0) & 7).toBe(1); // kWhirlpoolAcAuto
    expect(((raw[3] ?? 0) >> 4) + 18).toBe(21);
    expect((raw[2] ?? 0) & 3).toBe(3); // kWhirlpoolAcFanLow
    expect((raw[2] ?? 0) >> 7).toBe(1); // Swing1
    expect(((raw[8] ?? 0) >> 6) & 1).toBe(1); // Swing2
    expect(((raw[2] ?? 0) >> 3) & 1).toBe(1); // Sleep
    expect(((raw[2] ?? 0) >> 2) & 1).toBe(1); // Power toggle
    expect(raw[15]).toBe(1); // Command: Power
    expect(((raw[6] ?? 0) >> 5) & 1).toBe(0); // Light on
  });

  it('uses the DG11J1-91 range, 16-30C (SetAndGetModel)', () => {
    expect(WHIRLPOOL_CAPS.dg11j191.setpoint).toEqual({ min: 16, max: 30 });
    expect(WHIRLPOOL_CAPS.dg11j13a.setpoint).toEqual({ min: 18, max: 32 });
    const raw = whirlpoolBytes(on({ setpoint: 16 }), 'dg11j191', false);
    expect((raw[3] ?? 0) >> 4).toBe(0);
    expect(((raw[18] ?? 0) >> 3) & 1).toBe(1); // J191
    expect((whirlpoolBytes(on({ setpoint: 16 }), 'dg11j13a', false)[3] ?? 0) >> 4).toBe(0);
  });

  it('sets the power toggle only when the power changed (handleToggles)', () => {
    // The space after bit 18 (byte 2, bit 2), behind the two header entries.
    const power = (n: AcState, p?: AcState) =>
      whirlpoolAcSignal(n, p, 'dg11j13a').pattern[2 + 2 * 18 + 1];
    const one = 1649;
    const zero = 533;
    const off = { ...on(), power: false };
    expect(power(on(), off)).toBe(one);
    expect(power(off, on())).toBe(one);
    expect(power(on({ setpoint: 25 }), on())).toBe(zero);
    expect(power(on())).toBe(one); // unknown previous state is taken as off
    expect(power(off)).toBe(zero);
  });
});
