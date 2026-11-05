import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  GREE_CAPS,
  greeAcSignal,
  greeBytes,
  greeBytesToSignal,
  greeChecksum,
} from '@/ir/lgpl/greeAc';
import {
  GREE_OFF,
  GREE_REAL_RAW,
  GREE_REAL_STATE,
  GREE_RESET_STATE,
  GREE_SEND_DATA,
  GREE_SEND_DATA_STATE,
  GREE_YAW1F_ON,
  GREE_YBOFB_ON,
} from './greeAc.fixtures';
import { hex, timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });

describe('Gree (GREE)', () => {
  it('sends raw states with the upstream timings (SendData)', () => {
    expect(timing(greeBytesToSignal(GREE_SEND_DATA_STATE))).toBe(upstream(GREE_SEND_DATA));
  });

  it('matches the real capture from issue 386, within a receiver tolerance', () => {
    const ours = greeBytesToSignal(GREE_REAL_STATE).pattern;
    expect(ours).toHaveLength(GREE_REAL_RAW.length + 1);
    GREE_REAL_RAW.forEach((us, i) => {
      expect(Math.abs((ours[i] ?? 0) - us)).toBeLessThan(us * 0.25 + 100);
    });
  });

  it('computes the block checksum', () => {
    expect(greeChecksum(GREE_RESET_STATE)).toBe(GREE_RESET_STATE[7]! >> 4);
    expect(greeChecksum(GREE_REAL_STATE)).toBe(0xf);
  });

  it('builds the real YBOFB and YAW1F states of Issue814Power', () => {
    const s = on({ mode: 'cool', setpoint: 23, fan: 1, swing: true, sleep: false });
    expect(hex(greeBytes(s, 'ybofb'))).toEqual(hex(GREE_YBOFB_ON));
    expect(hex(greeBytes(s, 'yaw1f'))).toEqual(hex(GREE_YAW1F_ON));
    expect(hex(greeBytes({ ...s, power: false }, 'yaw1f'))).toEqual(hex(GREE_OFF));
    expect(hex(greeBytes({ ...s, power: false }, 'ybofb'))).toEqual(hex(GREE_OFF));
  });

  it('maps like IRac::gree (mode, fan, swing, sleep, auto locked to 25C)', () => {
    const raw = greeBytes(
      on({ mode: 'cool', setpoint: 18, fan: 3, swing: false, sleep: true }),
      'yaw1f',
    );
    expect(raw[0]! & 0b111).toBe(1); // kGreeCool
    expect((raw[0]! >> 4) & 0b11).toBe(3); // kGreeFanMax
    expect((raw[0]! >> 6) & 1).toBe(0); // SwingAuto off
    expect(raw[4]! & 0x0f).toBe(0); // kGreeSwingLastPos
    expect(raw[0]! >> 7).toBe(1); // Sleep
    expect(raw[1]! & 0x0f).toBe(18 - 16);
    expect(greeBytes(on({ fan: 2 }), 'yaw1f')[0]! & 0x30).toBe(0x20);
    // Dry locks the fan to 1; auto locks the temperature to 25C.
    expect((greeBytes(on({ mode: 'dry', fan: 3 }), 'yaw1f')[0]! >> 4) & 0b11).toBe(1);
    expect(greeBytes(on({ mode: 'auto', setpoint: 18 }), 'yaw1f')[1]! & 0x0f).toBe(25 - 16);
    expect(greeBytes(on({ mode: 'fan' }), 'yaw1f')[0]! & 0b111).toBe(3);
    expect(GREE_CAPS.setpoint).toEqual({ min: 16, max: 30 });
    expect(greeAcSignal(on(), 'yaw1f').pattern).toHaveLength(2 + 32 * 2 + 3 * 2 + 2 + 32 * 2 + 2);
  });
});
