import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  VOLTAS_CAPS,
  voltasAcSignal,
  voltasBytes,
  voltasBytesToSignal,
  voltasChecksum,
} from '@/ir/lgpl/voltasAc';
import { VOLTAS_REAL_RAW, VOLTAS_REAL_STATE, VOLTAS_RESET_STATE } from './voltasAc.fixtures';
import { hex } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });
const at = (raw: number[], i: number): number => raw[i] ?? 0;

describe('Voltas (VOLTAS)', () => {
  it('matches the real 122LZF capture, within a receiver tolerance', () => {
    const ours = voltasBytesToSignal(VOLTAS_REAL_STATE).pattern;
    // The capture ends on the footer mark; we add the message gap after it.
    expect(ours).toHaveLength(VOLTAS_REAL_RAW.length + 1);
    expect(ours[ours.length - 1]).toBe(100000);
    VOLTAS_REAL_RAW.forEach((us, i) => {
      expect(Math.abs((ours[i] ?? 0) - us)).toBeLessThan(us * 0.25 + 100);
    });
  });

  it('computes the checksum (TestIRVoltasClass.Checksums)', () => {
    expect(voltasChecksum(VOLTAS_REAL_STATE)).toBe(0xe6);
    expect(voltasChecksum(VOLTAS_RESET_STATE)).toBe(0xcb);
  });

  it('builds the real capture, apart from its WiFi bit', () => {
    const real = [...VOLTAS_REAL_STATE];
    real[2] = at(real, 2) & ~0x08; // WiFi: IRac does not set it
    real[9] = voltasChecksum(real);
    const s = on({ mode: 'dry', setpoint: 24, fan: 1, swing: false, sleep: false });
    expect(hex(voltasBytes(s))).toEqual(hex(real));
  });

  it('maps like IRac::voltas (no auto mode, sleep in cool only, fan auto not in fan mode)', () => {
    const raw = voltasBytes(on({ mode: 'cool', setpoint: 18, fan: 3, swing: true, sleep: true }));
    expect(at(raw, 1) & 0x0f).toBe(0b1000); // kVoltasCool
    expect(at(raw, 1) >> 5).toBe(0b001); // kVoltasFanHigh
    expect(at(raw, 2) & 0b111).toBe(0b111); // SwingV on
    expect((at(raw, 2) >> 6) & 1).toBe(1); // Sleep
    expect(at(raw, 2) >> 7).toBe(1); // Power
    expect(at(raw, 3) & 0x0f).toBe(18 - 16);
    expect(at(raw, 0)).toBe(0x33); // 122LZF: no swing(H) change
    expect(at(raw, 9)).toBe(voltasChecksum(raw));
    expect((at(voltasBytes(on({ mode: 'fan', sleep: true })), 2) >> 6) & 1).toBe(0);
    expect(at(voltasBytes(on({ mode: 'fan', fan: 'auto' })), 1) >> 5).toBe(0b001);
    expect(at(voltasBytes(on({ mode: 'cool', fan: 'auto' })), 1) >> 5).toBe(0b111);
    expect(at(voltasBytes(on({ fan: 2 })), 1) >> 5).toBe(0b010);
    expect(at(voltasBytes({ ...on(), power: false }), 2) >> 7).toBe(0);
    expect(VOLTAS_CAPS.acModes).toEqual(['cool', 'dry', 'fan']);
    expect(voltasBytes(on({ mode: 'auto' }))).toEqual(voltasBytes(on({ mode: 'cool' })));
    expect(VOLTAS_CAPS.setpoint).toEqual({ min: 16, max: 30 });
    expect(voltasAcSignal(on()).pattern).toHaveLength(80 * 2 + 2);
  });
});
