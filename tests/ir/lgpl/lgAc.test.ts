import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  kLgAcOffCommand,
  kLgAcSwingVOff,
  kLgAcSwingVSwing,
  kLgAcSwingVToggle,
  lg2Signal,
  lgAcCodes,
  lgAcFrames,
  lgChecksum,
  lgSignal,
  lgStateCode,
} from '@/ir/lgpl/lgAc';
import { LG2_SEND_DATA_ONLY, LG_SEND_DATA_ONLY } from './lgAc.fixtures';
import { timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });
const fields = (code: number) => ({
  sign: code >>> 20,
  power: (code >>> 18) & 3,
  mode: (code >>> 12) & 7,
  temp: ((code >>> 8) & 0xf) + 15,
  fan: (code >>> 4) & 0xf,
});

describe('LG AC', () => {
  it('sends 28-bit LG and LG2 messages with the upstream timings (SendDataOnly)', () => {
    expect(timing(lgSignal(0x4b4ae51))).toBe(upstream(LG_SEND_DATA_ONLY));
    expect(timing(lg2Signal(0x880094d))).toBe(upstream(LG2_SEND_DATA_ONLY));
  });

  it('computes the upstream checksum (calcChecksum)', () => {
    expect(lgChecksum(0x88c0051)).toBe(0x1);
    expect(lgChecksum(0x88c0354)).toBe(0x4);
  });

  it('builds the upstream state messages (MessageConstruction, KnownExamples)', () => {
    // on, Cool, 25C, FanHigh -> 0x8800A4E (fan High becomes Maximum outside AKB74955603).
    expect(lgStateCode(on({ setpoint: 25, fan: 3 }), 'lg6711a20083v')).toBe(0x8800a4e);
    // Cool 18C Maximum, Cool 19C Auto.
    expect(lgStateCode(on({ setpoint: 18, fan: 3 }), 'akb75215403')).toBe(0x8800347);
    expect(lgStateCode(on({ setpoint: 19, fan: 'auto' }), 'akb75215403')).toBe(0x8800459);
  });

  it('maps like IRac::lg (TestIRac.LG and LG2)', () => {
    // GE6711AR2853M-style state: Dry, 27C, Medium, one message.
    const [ge] = lgAcCodes(on({ mode: 'dry', setpoint: 27, fan: 2 }), on(), 'lg6711a20083v');
    expect(fields(ge ?? 0)).toEqual({ sign: 0x88, power: 0, mode: 1, temp: 27, fan: 2 });
    // AKB74955603: Low is the alternate low code 9.
    const [akb] = lgAcCodes(on({ mode: 'dry', setpoint: 27, fan: 1 }), on(), 'akb74955603');
    expect(fields(akb ?? 0)).toEqual({ sign: 0x88, power: 0, mode: 1, temp: 27, fan: 9 });
    expect(fields(lgStateCode(on({ fan: 3 }), 'akb74955603')).fan).toBe(10);
  });

  it('sends a swing message only when the swing changed (Issue1651, Issue1513)', () => {
    // Auto mode at 15C (16C is the minimum), swing off before and after: one message.
    const auto15 = on({ mode: 'auto', setpoint: 15 });
    expect(lgAcCodes(auto15, auto15, 'akb74955603')).toHaveLength(1);
    expect(fields(lgAcCodes(auto15, auto15, 'akb74955603')[0] ?? 0)).toMatchObject({
      mode: 3,
      temp: 16,
      fan: 5,
    });
    // Swing off to auto: the state, then kLgAcSwingVSwing.
    const swingOn = { ...auto15, swing: true };
    expect(lgAcCodes(swingOn, auto15, 'akb74955603')[1]).toBe(kLgAcSwingVSwing);
    // Swing auto to off: the state, then kLgAcSwingVOff.
    expect(lgAcCodes(auto15, swingOn, 'akb74955603')[1]).toBe(kLgAcSwingVOff);
    // Unknown previous swing is taken as off.
    expect(lgAcCodes(swingOn, undefined, 'akb74955603')).toHaveLength(2);
    expect(lgAcCodes(auto15, undefined, 'akb74955603')).toHaveLength(1);
  });

  it('uses the swing toggle on LG6711A20083V and no swing message on AKB75215403', () => {
    expect(lgAcCodes(on({ swing: true }), on(), 'lg6711a20083v')[1]).toBe(kLgAcSwingVToggle);
    expect(lgAcCodes(on(), on({ swing: true }), 'lg6711a20083v')[1]).toBe(kLgAcSwingVToggle);
    expect(lgAcCodes(on({ swing: true }), on(), 'akb75215403')).toHaveLength(1);
  });

  it('always sends the off command alone for power off', () => {
    expect(lgAcCodes({ ...on(), power: false, swing: true }, on(), 'akb74955603')).toEqual([
      kLgAcOffCommand,
    ]);
  });

  it('uses LG timings for LG6711A20083V and LG2 timings otherwise', () => {
    expect(lgAcFrames(on(), on(), 'lg6711a20083v')[0]?.pattern[0]).toBe(8500);
    expect(lgAcFrames(on(), on(), 'akb74955603')[0]?.pattern[0]).toBe(3200);
    expect(lgAcFrames(on({ swing: true }), on(), 'akb74955603')[1]).toEqual(
      lg2Signal(kLgAcSwingVSwing),
    );
  });
});
