import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  DAIKIN_CAPS,
  daikin216Bytes,
  daikin216BytesToSignal,
  daikinAcSignal,
  daikinBytes,
  daikinBytesToSignal,
  daikinChecksum,
} from '@/ir/lgpl/daikinAc';
import {
  DAIKIN216_KNOWN_STATE,
  DAIKIN_CHECKSUM_VALID_STATE,
  DAIKIN_MESSAGE_CONSTRUCTION,
  DAIKIN_SEND_DATA_ONLY,
  DAIKIN_SEND_DATA_ONLY_STATE,
} from './daikinAc.fixtures';
import { hex, timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });

describe('Daikin (DAIKIN, 280 bits)', () => {
  it('sends a raw state with the upstream timings (SendDataOnly)', () => {
    expect(timing(daikinBytesToSignal(DAIKIN_SEND_DATA_ONLY_STATE))).toBe(
      upstream(DAIKIN_SEND_DATA_ONLY),
    );
  });

  it('computes the three section checksums (ChecksumValidation)', () => {
    const raw = [...DAIKIN_CHECKSUM_VALID_STATE];
    raw[7] = raw[15] = raw[34] = 0;
    daikinChecksum(raw);
    expect(hex(raw)).toEqual(hex(DAIKIN_CHECKSUM_VALID_STATE));
  });

  it('builds the MessageConstuction state (with its horizontal swing put back)', () => {
    // Upstream turns horizontal swing on in this test; we always send it off, so set it here.
    const raw = daikinBytes(on({ mode: 'cool', setpoint: 27, fan: 1, swing: false }));
    raw[25] = ((raw[25] ?? 0) & 0xf0) | 0x0f;
    daikinChecksum(raw);
    expect(timing(daikinBytesToSignal(raw))).toBe(upstream(DAIKIN_MESSAGE_CONSTRUCTION));
  });

  it('maps the fields like the IRDaikinESP setters', () => {
    const raw = daikinBytes(on({ mode: 'dry', setpoint: 21, fan: 'auto', swing: true }));
    expect((raw[21] ?? 0) & 1).toBe(1); // Power
    expect(((raw[21] ?? 0) >> 4) & 7).toBe(0b010); // kDaikinDry
    expect(raw[22]).toBe(42); // Temp * 2
    expect((raw[24] ?? 0) >> 4).toBe(0xa); // kDaikinFanAuto
    expect((raw[24] ?? 0) & 0xf).toBe(0xf); // kDaikinSwingOn
    expect((raw[25] ?? 0) & 0xf).toBe(0); // horizontal swing off
    // Fan low / medium / high are kDaikinFanMin, kDaikinFanMed, kDaikinFanMax - 1, stored + 2.
    expect([1, 2, 3].map((f) => (daikinBytes(on({ fan: f as 1 | 2 | 3 }))[24] ?? 0) >> 4)).toEqual([
      3, 5, 6,
    ]);
    expect(((daikinBytes(on({ mode: 'fan' }))[21] ?? 0) >> 4) & 7).toBe(0b110);
    expect(((daikinBytes(on({ mode: 'auto' }))[21] ?? 0) >> 4) & 7).toBe(0b000);
    expect((daikinBytes({ ...on(), power: false })[21] ?? 0) & 1).toBe(0);
  });

  it('clamps the setpoint to 10-32C (Temperature)', () => {
    expect(DAIKIN_CAPS.setpoint).toEqual({ min: 10, max: 32 });
    expect(daikinBytes(on({ setpoint: 0 }))[22]).toBe(20);
    expect(daikinBytes(on({ setpoint: 255 }))[22]).toBe(64);
  });
});

describe('Daikin (DAIKIN216)', () => {
  it('rebuilds the known state (ReconstructKnownState)', () => {
    const s: AcState = { ...on({ mode: 'auto', setpoint: 19, fan: 'auto' }), power: false };
    expect(hex(daikin216Bytes(s))).toEqual(hex(DAIKIN216_KNOWN_STATE));
  });

  it('maps the fields like the IRDaikin216 setters', () => {
    const raw = daikin216Bytes(on({ mode: 'cool', setpoint: 26, fan: 3, swing: true }));
    expect((raw[13] ?? 0) & 1).toBe(1);
    expect(((raw[13] ?? 0) >> 4) & 7).toBe(0b011);
    expect(((raw[14] ?? 0) >> 1) & 0x3f).toBe(26);
    expect((raw[16] ?? 0) >> 4).toBe(6);
    expect((raw[16] ?? 0) & 0xf).toBe(0xf);
  });

  it('sends two sections with the DAIKIN216 timings', () => {
    const sig = daikin216BytesToSignal(DAIKIN216_KNOWN_STATE);
    // Header, 64 bits, footer; header, 152 bits, footer.
    expect(sig.pattern).toHaveLength(2 + 2 * 64 + 2 + (2 + 2 * 152 + 2));
    expect(sig.pattern.slice(0, 4)).toEqual([3440, 1750, 420, 1300]); // 0x11 sent LSB first
    expect(sig.pattern[2 + 2 * 64 + 1]).toBe(29650);
    expect(daikinAcSignal(on(), 'daikin216')).toEqual(daikin216BytesToSignal(daikin216Bytes(on())));
  });
});
