import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  COOLIX_CAPS,
  coolixAcSignal,
  coolixToSignal,
  coolixValue,
  kCoolixSleep,
  kCoolixSwing,
} from '@/ir/lgpl/coolixAc';
import {
  COOLIX_IRAC_HEAT_21_HIGH,
  COOLIX_ISSUE722_FAN_MAX,
  COOLIX_KNOWN_VALUES as K,
  COOLIX_SEND_ZERO,
} from './coolixAc.fixtures';
import { timing, upstream } from './timing';

const on = (o: Partial<AcState> = {}): AcState => ({ ...defaultAcState(), power: true, ...o });

describe('Coolix (COOLIX)', () => {
  it('sends a 24-bit value twice with the upstream timings', () => {
    expect(timing(coolixToSignal(0))).toBe(upstream(COOLIX_SEND_ZERO));
    expect(timing(coolixToSignal(0xb23fe4))).toBe(upstream(COOLIX_ISSUE722_FAN_MAX));
    // IRac::coolix with Heat 21C fan High: the same framing, value 0xB23F6C.
    expect(timing(coolixToSignal(0xb23f6c))).toBe(upstream(COOLIX_IRAC_HEAT_21_HIGH));
  });

  it('builds the states of Issue722, KnownExamples and Issue624', () => {
    expect(coolixValue(on({ mode: 'auto', setpoint: 17, fan: 'auto' }))).toBe(K.autoTemp17);
    expect(coolixValue(on({ mode: 'auto', setpoint: 18, fan: 'auto' }))).toBe(K.autoTemp18);
    expect(coolixValue(on({ mode: 'cool', setpoint: 18, fan: 'auto' }))).toBe(K.coolTemp18);
    expect(coolixValue(on({ mode: 'dry', setpoint: 18, fan: 'auto' }))).toBe(K.dryTemp18);
    expect(coolixValue(on({ mode: 'fan', setpoint: 18, fan: 'auto' }))).toBe(K.fanAuto);
    expect(coolixValue(on({ mode: 'fan', fan: 1 }))).toBe(K.fanMin);
    expect(coolixValue(on({ mode: 'fan', fan: 2 }))).toBe(K.fanMed);
    expect(coolixValue(on({ mode: 'fan', fan: 3 }))).toBe(K.fanMax);
    expect(coolixValue(on({ mode: 'cool', setpoint: 24, fan: 'auto' }))).toBe(K.coolTemp24);
    expect(coolixValue(on({ mode: 'cool', setpoint: 17, fan: 1 }))).toBe(K.coolTemp17Min);
    expect(coolixValue(on({ mode: 'cool', setpoint: 10 }))).toBe(coolixValue(on({ setpoint: 17 })));
    expect(COOLIX_CAPS.setpoint).toEqual({ min: 17, max: 30 });
  });

  it('sends only the off message when the power is off, as IRac::coolix does', () => {
    const frames = coolixAcSignal({ ...on({ swing: true, sleep: true }), power: false });
    expect(frames).toHaveLength(1);
    expect(timing(frames)).toBe(timing(coolixToSignal(K.off)));
  });

  it('sends the swing and sleep toggles after the state when they change (unknown is off)', () => {
    const s = on({ mode: 'cool', setpoint: 24, fan: 'auto' });
    const state = timing(coolixToSignal(K.coolTemp24));
    const swing = timing(coolixToSignal(kCoolixSwing));
    const sleep = timing(coolixToSignal(kCoolixSleep));
    const t = (next: AcState, prev?: AcState): string[] =>
      coolixAcSignal(next, prev).map((f) => timing(f));
    expect(t(s)).toEqual([state]);
    expect(t({ ...s, swing: true })).toEqual([state, swing]);
    expect(t({ ...s, swing: true, sleep: true })).toEqual([state, swing, sleep]);
    expect(t({ ...s, swing: true }, { ...s, swing: true })).toEqual([state]);
    expect(t(s, { ...s, swing: true, sleep: true })).toEqual([state, swing, sleep]);
    expect(t({ ...s, sleep: true }, { ...s, swing: false })).toEqual([state, sleep]);
  });
});
