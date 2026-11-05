import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import { reverseBits } from '@/ir/lgpl/irsend';
import {
  hitachi424AcSignal,
  hitachi424Bytes,
  hitachi424BytesToSignal,
  hitachiBytes,
  hitachiBytesToSignal,
  hitachiChecksum,
} from '@/ir/lgpl/hitachiAc';
import {
  HITACHI424_REAL_EXAMPLE,
  HITACHI_SEND_DATA,
  HITACHI_SEND_DATA_STATE,
} from './hitachiAc.fixtures';
import { hex, timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });
const r8 = (v: number | undefined) => reverseBits(v ?? 0, 8);

describe('Hitachi (HITACHI_AC)', () => {
  it('sends a raw state with the upstream timings (SendData)', () => {
    expect(timing(hitachiBytesToSignal(HITACHI_SEND_DATA_STATE))).toBe(upstream(HITACHI_SEND_DATA));
  });

  it('computes the upstream checksum (ChecksumCalculation)', () => {
    expect(hitachiChecksum(HITACHI_SEND_DATA_STATE)).toBe(0xac);
  });

  it('maps like IRac::hitachi (TestIRac.Hitachi: Auto, 22C, Medium, swing(V) off)', () => {
    const raw = hitachiBytes(on({ mode: 'auto', setpoint: 22, fan: 2, swing: false }));
    expect(r8(raw[10])).toBe(2); // kHitachiAcAuto
    expect(r8(raw[11]) >> 1).toBe(22);
    expect(r8(raw[13])).toBe(3); // kHitachiAcFanMed
    expect((raw[14] ?? 0) >> 7).toBe(0);
    expect((raw[17] ?? 0) & 1).toBe(1);
    expect(raw[27]).toBe(hitachiChecksum(raw));
  });

  it('limits the fan per mode (SetAndGetFan)', () => {
    const fan = (s: AcState) => r8(hitachiBytes(s)[13]);
    expect(fan(on({ mode: 'cool', fan: 'auto' }))).toBe(1);
    expect(fan(on({ mode: 'cool', fan: 3 }))).toBe(4); // kHitachiAcFanHigh - 1
    expect(fan(on({ mode: 'fan', fan: 'auto' }))).toBe(2); // no auto in fan mode
    expect(fan(on({ mode: 'dry', fan: 3 }))).toBe(3); // two low speeds in dry
    expect(fan(on({ mode: 'dry', fan: 'auto' }))).toBe(2);
  });

  it('clamps the temperature and flags the minimum (SetAndGetTemp)', () => {
    expect(r8(hitachiBytes(on({ setpoint: 10 }))[11]) >> 1).toBe(16);
    expect(hitachiBytes(on({ setpoint: 10 }))[9]).toBe(0x90);
    expect(r8(hitachiBytes(on({ setpoint: 40 }))[11]) >> 1).toBe(32);
    expect(hitachiBytes(on({ setpoint: 24 }))[9]).toBe(0x10);
    expect(r8(hitachiBytes(on({ mode: 'cool' }))[10])).toBe(4);
    expect(r8(hitachiBytes(on({ mode: 'dry' }))[10])).toBe(5);
    expect(r8(hitachiBytes(on({ mode: 'fan' }))[10])).toBe(0xc);
    expect((hitachiBytes(on({ swing: true }))[14] ?? 0) >> 7).toBe(1);
  });
});

describe('Hitachi (HITACHI_AC424)', () => {
  it('rebuilds the real RAR-8P2 capture: on, Cool, 23C, Auto (RealExample)', () => {
    const s = on({ mode: 'cool', setpoint: 23, fan: 'auto', swing: false });
    expect(hex(hitachi424Bytes(s, false))).toEqual(hex(HITACHI424_REAL_EXAMPLE));
  });

  it('sends the leader, then the bytes LSB first', () => {
    const sig = hitachi424BytesToSignal(HITACHI424_REAL_EXAMPLE);
    expect(sig.pattern.slice(0, 6)).toEqual([29784, 49290, 3416, 1604, 463, 1208]);
    expect(sig.pattern).toHaveLength(4 + 53 * 16 + 2);
    expect(sig.pattern.at(-1)).toBe(100000);
  });

  it('uses the Swing(V) button only when the swing changed (TestIRac.Hitachi424)', () => {
    const swingOn = on({ setpoint: 26, swing: true });
    expect(hitachi424Bytes(swingOn, true)[11]).toBe(0x81);
    expect(hitachi424AcSignal(swingOn, on())).toEqual(
      hitachi424BytesToSignal(hitachi424Bytes(swingOn, true)),
    );
    expect(hitachi424AcSignal(swingOn, swingOn)).toEqual(
      hitachi424BytesToSignal(hitachi424Bytes(swingOn, false)),
    );
    expect(hitachi424AcSignal(swingOn)).toEqual(
      hitachi424BytesToSignal(hitachi424Bytes(swingOn, true)),
    );
    expect(hitachi424Bytes(swingOn, false)[11]).toBe(0x13);
  });

  it('limits the fan per mode and sets the extra fan bytes (SetAndGetFan)', () => {
    const fan = (s: AcState) => (hitachi424Bytes(s, false)[25] ?? 0) >> 4;
    expect(fan(on({ mode: 'fan', fan: 'auto' }))).toBe(1);
    expect(hitachi424Bytes(on({ mode: 'fan', fan: 'auto' }), false)[9]).toBe(0x98);
    expect(fan(on({ mode: 'dry', fan: 3 }))).toBe(2);
    expect(fan(on({ mode: 'dry', fan: 'auto' }))).toBe(5);
    expect([1, 2, 3].map((f) => fan(on({ fan: f as 1 | 2 | 3 })))).toEqual([2, 3, 4]);
    // Auto mode is sent as cool, as IRHitachiAc424::convertMode does.
    expect((hitachi424Bytes(on({ mode: 'auto' }), false)[25] ?? 0) & 0xf).toBe(3);
    expect((hitachi424Bytes({ ...on(), power: false }, false)[27] ?? 0) & 0x10).toBe(0);
  });
});
