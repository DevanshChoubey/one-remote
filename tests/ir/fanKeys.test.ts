import type { FanState } from '@/core';
import type { FanKey } from '@/ir/catalogue';
import { fanKeys } from '@/ir/fanKeys';

const all = new Set<FanKey>([
  'off',
  'speed1',
  'speed2',
  'speed3',
  'speed4',
  'speed5',
  'boost',
  'sleep',
  'light',
  'timer1',
  'timer2',
  'timer4',
  'timer8',
  'timerOff',
]);
const on = (o: Partial<FanState> = {}): FanState => ({
  power: true,
  speed: 3,
  boost: false,
  sleep: false,
  timerHours: 0,
  ...o,
});

describe('fanKeys', () => {
  it('sends only the speed when the last state is unknown (no blind toggles)', () => {
    expect(fanKeys(undefined, on({ boost: true, sleep: true, light: true }), all)).toEqual([
      'speed3',
    ]);
  });

  it('sends boost when it changed on a known, running fan', () => {
    expect(fanKeys(on(), on({ boost: true }), all)).toEqual(['boost']);
  });

  it('sends off when power is off', () => {
    expect(fanKeys(on({ speed: 2 }), on({ power: false }), all)).toEqual(['off']);
    expect(fanKeys(undefined, on({ power: false }), all)).toEqual(['off']);
  });

  it('sends the speed after power on or a speed change, not when unchanged', () => {
    expect(fanKeys(on({ power: false }), on({ speed: 3 }), all)).toEqual(['speed3']);
    expect(fanKeys(on({ speed: 2 }), on({ speed: 4 }), all)).toEqual(['speed4']);
    expect(fanKeys(on(), on(), all)).toEqual([]);
  });

  it('sends speed then toggles that changed, only when the key exists', () => {
    expect(fanKeys(on(), on({ speed: 4, sleep: true, light: true }), all)).toEqual([
      'speed4',
      'sleep',
      'light',
    ]);
    expect(fanKeys(on(), on({ sleep: true, light: true }), new Set<FanKey>(['light']))).toEqual([
      'light',
    ]);
  });

  it('does not toggle when power was off (state after power on is unknown)', () => {
    expect(fanKeys(on({ power: false }), on({ boost: true }), all)).toEqual(['speed3']);
  });

  it('sends timer keys when the timer changed and the key exists', () => {
    expect(fanKeys(on(), on({ timerHours: 4 }), all)).toEqual(['timer4']);
    expect(fanKeys(on({ timerHours: 4 }), on({ timerHours: 0 }), all)).toEqual(['timerOff']);
    expect(fanKeys(on(), on({ timerHours: 4 }), new Set<FanKey>(['speed3']))).toEqual([]);
  });

  it('skips a speed key the remote lacks', () => {
    expect(fanKeys(undefined, on(), new Set<FanKey>(['off']))).toEqual([]);
  });
});
