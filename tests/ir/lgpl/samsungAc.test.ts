import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  samsungAcBytes,
  samsungAcSignal,
  samsungBytesToSignal,
  samsungSectionChecksum,
} from '@/ir/lgpl/samsungAc';
import {
  EXTENDED_SECTION,
  SEND_DATA_ONLY,
  SEND_DATA_ONLY_STATE,
  SEND_EXTENDED,
  SEND_EXTENDED_STATE,
  SETTINGS_1,
  SETTINGS_2,
} from './samsungAc.fixtures';
import { timing, upstream } from './timing';

// Issue604SendPowerHack: Cool, 23C, fan Med, swing (stateReset leaves vertical swing on).
const cool23: AcState = { ...defaultAcState(), power: true, setpoint: 23, fan: 2, swing: true };

describe('Samsung AC', () => {
  it('sends a raw state with the upstream timings (SendDataOnly, SendExtendedData)', () => {
    expect(timing(samsungBytesToSignal(SEND_DATA_ONLY_STATE))).toBe(upstream(SEND_DATA_ONLY));
    expect(timing(samsungBytesToSignal(SEND_EXTENDED_STATE))).toBe(upstream(SEND_EXTENDED));
  });

  it('sends the normal message when the power is unchanged (Issue604SendPowerHack)', () => {
    expect(timing(samsungAcSignal(cool23, cool23))).toBe(
      upstream(`f38000${SETTINGS_1}${SETTINGS_2}`),
    );
    expect(timing(samsungAcSignal(cool23, { ...cool23, setpoint: 30 }))).not.toBe('');
  });

  it('sends the extended message when the power changes or is unknown', () => {
    const ext = upstream(`f38000${SETTINGS_1}${EXTENDED_SECTION}${SETTINGS_2}`);
    expect(timing(samsungAcSignal(cool23, { ...cool23, power: false }))).toBe(ext);
    expect(timing(samsungAcSignal(cool23))).toBe(ext);
  });

  it('computes the upstream section checksums (SectionChecksums)', () => {
    const on = [0x02, 0x82, 0x0f, 0x00, 0x00, 0x20, 0xf0, 0x01, 0xf2, 0xfe, 0x71, 0x00, 0x11, 0xf0];
    expect(samsungSectionChecksum(on, 0)).toBe(0xf8);
    expect(samsungSectionChecksum(on, 7)).toBe(0xef);
    expect(samsungSectionChecksum(SEND_EXTENDED_STATE, 0)).toBe(0xfb);
    expect(samsungSectionChecksum(SEND_EXTENDED_STATE, 7)).toBe(0xfd);
    expect(samsungSectionChecksum(SEND_EXTENDED_STATE, 14)).toBe(0xf0);
  });

  it('maps modes, fan and clamps the setpoint', () => {
    const b = (s: Partial<AcState>): Uint8Array =>
      samsungAcBytes({ ...cool23, ...s }, { ...cool23, ...s });
    const mode = (x: Uint8Array): number => ((x[12] ?? 0) >> 4) & 7;
    const fan = (x: Uint8Array): number => ((x[12] ?? 0) >> 1) & 7;
    expect(mode(b({ mode: 'dry' }))).toBe(2);
    expect(mode(b({ mode: 'fan' }))).toBe(3);
    // Auto mode forces the special Auto2 fan, whatever was asked.
    expect(fan(b({ mode: 'auto', fan: 3 }))).toBe(6);
    expect([1, 2, 3, 'auto'].map((f) => fan(b({ fan: f as AcState['fan'] })))).toEqual([
      2, 4, 5, 0,
    ]);
    expect((b({ setpoint: 40 })[11] ?? 0) >> 4).toBe(14);
    expect((b({ setpoint: 10 })[11] ?? 0) >> 4).toBe(0);
    expect(((b({ swing: false })[9] ?? 0) >> 4) & 7).toBe(0b111);
    expect(((b({ power: false })[6] ?? 0) >> 4) & 3).toBe(0);
  });

  it('round-trips the reset bytes for a known state', () => {
    // Power on, Cool 24, auto fan, swing off; checks the checksum rule on our own output.
    const x = samsungAcBytes(
      { ...defaultAcState(), power: true },
      { ...defaultAcState(), power: true },
    );
    expect(x).toHaveLength(14);
    expect((((x[2] ?? 0) & 0xf) << 4) | ((x[1] ?? 0) >> 4)).toBe(samsungSectionChecksum(x, 0));
    expect((((x[9] ?? 0) & 0xf) << 4) | ((x[8] ?? 0) >> 4)).toBe(samsungSectionChecksum(x, 7));
  });
});
