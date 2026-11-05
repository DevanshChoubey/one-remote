import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  MIDEA_CAPS,
  mideaAcSignal,
  mideaChecksum,
  mideaToSignal,
  mideaValue,
} from '@/ir/lgpl/mideaAc';
import {
  MIDEA_CHECKSUM_STATE,
  MIDEA_COOL_LOW_17C,
  MIDEA_COOL_LOW_30C,
  MIDEA_ISSUE1318,
  MIDEA_SEND_ZERO,
  MIDEA_TOGGLE_SWINGV,
} from './mideaAc.fixtures';
import { timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });
const byteAt = (v: number, i: number): number => Math.floor(v / 2 ** (8 * i)) % 256;

describe('Midea (MIDEA)', () => {
  it('sends a 48-bit value, then its inverse, with the upstream timings', () => {
    expect(timing(mideaToSignal(0))).toBe(upstream(MIDEA_SEND_ZERO));
    expect(timing(mideaToSignal(0xa4a3477f1979))).toBe(upstream(MIDEA_ISSUE1318));
  });

  it('computes the checksum (TestMideaACClass.Checksums)', () => {
    expect(mideaChecksum(MIDEA_CHECKSUM_STATE)).toBe(0x70);
    expect(mideaChecksum(0xa1826fffff00)).toBe(0x62);
  });

  it('builds the CelsiusRemoteTemp states', () => {
    const s = on({ mode: 'cool', fan: 1, swing: false, sleep: false });
    expect(mideaValue({ ...s, setpoint: 17 }).toString(16)).toBe(MIDEA_COOL_LOW_17C.toString(16));
    expect(mideaValue({ ...s, setpoint: 30 }).toString(16)).toBe(MIDEA_COOL_LOW_30C.toString(16));
    expect(mideaValue({ ...s, setpoint: 35 })).toBe(MIDEA_COOL_LOW_30C);
    expect(MIDEA_CAPS.setpoint).toEqual({ min: 17, max: 30 });
  });

  it('maps like IRac::midea (mode, fan, sleep, power)', () => {
    const v = mideaValue(on({ mode: 'dry', setpoint: 27, fan: 2, sleep: true }));
    const b4 = byteAt(v, 4);
    expect(b4 & 0b111).toBe(1); // kMideaACDry
    expect((b4 >> 3) & 0b11).toBe(2); // kMideaACFanMed
    expect((b4 >> 6) & 1).toBe(1); // Sleep
    expect(b4 >> 7).toBe(1); // Power
    expect(byteAt(v, 3)).toBe(0x40 | (27 - 17));
    expect(byteAt(v, 5)).toBe(0xa1); // Header, Type command
    expect(byteAt(v, 0)).toBe(mideaChecksum(v));
    expect(byteAt(mideaValue({ ...on(), power: false }), 4) >> 7).toBe(0);
    expect(byteAt(mideaValue(on({ mode: 'fan', fan: 3 })), 4) & 0b11111).toBe(0b11100);
    expect(byteAt(mideaValue(on({ mode: 'auto', fan: 'auto' })), 4) & 0b11111).toBe(0b00010);
  });

  it('sends the swing(V) toggle after the state when the swing changes (unknown is off)', () => {
    const s = on({ mode: 'cool', setpoint: 24 });
    const state = timing(mideaToSignal(mideaValue(s)));
    const toggle = timing(mideaToSignal(MIDEA_TOGGLE_SWINGV));
    const t = (next: AcState, prev?: AcState): string[] =>
      mideaAcSignal(next, prev).map((f) => timing(f));
    expect(t(s)).toEqual([state]);
    expect(t({ ...s, swing: true })).toEqual([state, toggle]);
    expect(t({ ...s, swing: true }, { ...s, swing: true })).toEqual([state]);
    expect(t(s, { ...s, swing: true })).toEqual([state, toggle]);
  });
});
