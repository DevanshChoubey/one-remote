import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  MHI152_CAPS,
  MHI88_CAPS,
  mhi152Bytes,
  mhi88Bytes,
  mhiBytesToSignal,
  mitsubishiHeavy152AcSignal,
  mitsubishiHeavy88AcSignal,
} from '@/ir/lgpl/mitsubishiHeavyAc';
import {
  MHI152_KNOWN_STATE,
  MHI152_REAL_RAW,
  MHI88_SYNTHETIC_STATE,
} from './mitsubishiHeavyAc.fixtures';
import { hex } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });

/** invertBytePairs from byte 3, as the protocol's "checksum". */
const reinvert = (raw: number[]): number[] => {
  for (let i = 4; i < raw.length; i += 2) raw[i] = ~(raw[i - 1] ?? 0) & 0xff;
  return raw;
};

describe('Mitsubishi Heavy (MITSUBISHI_HEAVY_152)', () => {
  it('matches the real ZMS capture, within a receiver tolerance', () => {
    const ours = mhiBytesToSignal(MHI152_KNOWN_STATE).pattern;
    // The capture ends on the footer mark; we add the message gap after it.
    expect(ours).toHaveLength(MHI152_REAL_RAW.length + 1);
    expect(ours[ours.length - 1]).toBe(100000);
    MHI152_REAL_RAW.forEach((us, i) => {
      expect(Math.abs((ours[i] ?? 0) - us)).toBeLessThan(us * 0.25 + 100);
    });
  });

  it('builds the ReconstructKnownExample state, with cool and fan High in place of heat and Max', () => {
    const real = [...MHI152_KNOWN_STATE];
    real[5] = 0x09; // Power on, Mode cool (the vector has heat)
    real[9] = 0x03; // Fan High (the vector has Max, which fan 3 does not reach)
    real[13] = 0x08; // SwingH off: IRac's default (the vector has auto)
    reinvert(real);
    const s = on({ mode: 'cool', setpoint: 24, fan: 3, swing: true, sleep: false });
    expect(hex(mhi152Bytes(s))).toEqual(hex(real));
  });

  it('maps like IRac::mitsubishiHeavy152 (fan, swing, night, power)', () => {
    const raw = mhi152Bytes(on({ mode: 'dry', setpoint: 40, fan: 1, swing: false, sleep: true }));
    expect((raw[5] ?? 0) & 0x0f).toBe(0b1010); // Power on, Dry
    expect((raw[7] ?? 0) & 0x0f).toBe(31 - 17); // clamped to 31C
    expect((raw[9] ?? 0) & 0x0f).toBe(0x1); // Low
    expect(((raw[11] ?? 0) >> 5) & 0b111).toBe(6); // SwingV off
    expect(((raw[15] ?? 0) >> 6) & 1).toBe(1); // Night
    expect(((mhi152Bytes({ ...on(), power: false })[5] ?? 0) >> 3) & 1).toBe(0);
    expect((mhi152Bytes(on({ mode: 'fan', fan: 2 }))[5] ?? 0) & 0b111).toBe(3);
    expect((mhi152Bytes(on({ mode: 'auto', fan: 'auto' }))[9] ?? 0) & 0x0f).toBe(0);
    expect(MHI152_CAPS.setpoint).toEqual({ min: 17, max: 31 });
    expect(mitsubishiHeavy152AcSignal(on()).pattern).toHaveLength(2 + 19 * 16 + 2);
  });
});

describe('Mitsubishi Heavy (MITSUBISHI_HEAVY_88)', () => {
  it('builds the ZjsSyntheticExample state, apart from its left-right swing(H)', () => {
    const real = [...MHI88_SYNTHETIC_STATE];
    real[5] = 0x00; // SwingH off: IRac's default (the vector has left-right)
    reinvert(real);
    const s = on({ mode: 'dry', setpoint: 25, fan: 'auto', swing: false });
    expect(hex(mhi88Bytes(s))).toEqual(hex(real));
  });

  it('maps like IRac::mitsubishiHeavy88 (fan, swing(V) auto split over bytes 5 and 7)', () => {
    const raw = mhi88Bytes(on({ mode: 'cool', setpoint: 17, fan: 3, swing: true }));
    expect((raw[9] ?? 0) & 0x0f).toBe(0b1001); // Power on, Cool
    expect((raw[9] ?? 0) >> 4).toBe(0);
    expect((raw[7] ?? 0) >> 5).toBe(4); // High
    // SwingV auto (0b100): bit 0 in byte 5 bit 1, bits 1-2 in byte 7 bits 3-4.
    expect(((raw[5] ?? 0) >> 1) & 1).toBe(0);
    expect(((raw[7] ?? 0) >> 3) & 0b11).toBe(0b10);
    expect((mhi88Bytes(on({ fan: 1 }))[7] ?? 0) >> 5).toBe(2); // Low
    expect((mhi88Bytes(on({ fan: 2 }))[7] ?? 0) >> 5).toBe(3); // Med
    expect(MHI88_CAPS.sleep).toBe(false);
    expect(mitsubishiHeavy88AcSignal(on()).pattern).toHaveLength(2 + 11 * 16 + 2);
  });
});
