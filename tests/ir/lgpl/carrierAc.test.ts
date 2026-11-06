import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  CARRIER64_CAPS,
  carrier64AcSignal,
  carrier64Bytes,
  carrier64BytesToSignal,
  carrier64Checksum,
  carrier64ValueBytes,
} from '@/ir/lgpl/carrierAc';
import { CARRIER64_REAL_VALUE, CARRIER64_SYNTHETIC } from './carrierAc.fixtures';
import { hex, timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });
const value = (b: number[]) => b.reduceRight((v, x) => (v << 8n) | BigInt(x), 0n);

describe('Carrier (CARRIER_AC64)', () => {
  it('sends the 64-bit value LSB first with the upstream timings (SyntheticExample)', () => {
    expect(timing(carrier64BytesToSignal(carrier64ValueBytes(CARRIER64_REAL_VALUE)))).toBe(
      upstream(CARRIER64_SYNTHETIC),
    );
  });

  it('computes the upstream checksum (ChecksumAndSetGetRaw)', () => {
    expect(carrier64Checksum(carrier64ValueBytes(CARRIER64_REAL_VALUE))).toBe(0xe);
    expect(carrier64Checksum(carrier64ValueBytes(0x109000002c2a5584n))).toBe(0xa);
  });

  it('gives the reset state for off, Cool, 28C, Auto, swing on (HumanReadable)', () => {
    const s: AcState = {
      ...on({ mode: 'cool', setpoint: 28, fan: 'auto', swing: true }),
      power: false,
    };
    expect(value(carrier64Bytes(s))).toBe(0x109000002c2a5584n);
  });

  it('maps like IRac::carrier64 (TestIRac.Carrier64, in cool)', () => {
    const b = carrier64Bytes(on({ mode: 'cool', setpoint: 21, fan: 3, swing: true, sleep: true }));
    const v = value(b);
    const bits = (at: number, n: number) => Number((v >> BigInt(at)) & ((1n << BigInt(n)) - 1n));
    expect(bits(36, 1)).toBe(1); // Power
    expect(bits(20, 2)).toBe(0b10); // kCarrierAc64Cool
    expect(bits(24, 4) + 16).toBe(21); // Temp
    expect(bits(22, 2)).toBe(0b11); // kCarrierAc64FanHigh
    expect(bits(29, 1)).toBe(1); // SwingV
    expect(bits(39, 1)).toBe(1); // Sleep
    expect(bits(37, 2)).toBe(0); // both timers off
    expect(bits(60, 4)).toBe(2); // setSleep's 2 hour off timer
    expect(bits(16, 4)).toBe(carrier64Checksum(b));
  });

  it('sends fan mode as fan and anything else as cool, and clamps 16-30C', () => {
    const mode = (s: AcState) => ((carrier64Bytes(s)[2] ?? 0) >> 4) & 3;
    expect(mode(on({ mode: 'fan' }))).toBe(0b11);
    expect(mode(on({ mode: 'dry' }))).toBe(0b10);
    expect(mode(on({ mode: 'auto' }))).toBe(0b10);
    expect(CARRIER64_CAPS.setpoint).toEqual({ min: 16, max: 30 });
    expect((carrier64Bytes(on({ setpoint: 40 }))[3] ?? 0) & 0xf).toBe(14);
    expect(hex(carrier64AcSignal(on()).pattern.slice(0, 2))).toEqual([8940, 4556]);
  });
});
