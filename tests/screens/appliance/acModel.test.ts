import { defaultAcState } from '@/core';
import type { Capabilities } from '@/core';
import type { DeviceView } from '@/services';
import { acView, nextAc } from '@/screens/appliance/acModel';
import { device } from '../helpers';

const view = (over: Partial<DeviceView> = {}): DeviceView => ({
  device: device('d', 'r', 0),
  usable: true,
  status: { via: null, fellBack: false },
  capabilities: {},
  ...over,
});

describe('acView', () => {
  it('uses a reported state with the room temperature', () => {
    const state = { ...defaultAcState(), power: true };
    const v = acView(view({ state: { kind: 'ac', state, roomTemp: 27 } }));
    expect(v).toMatchObject({ state, source: 'reported', roomTemp: 27 });
  });

  it('uses the last sent state, with no room temperature', () => {
    const state = { ...defaultAcState(), setpoint: 22 };
    const v = acView(view({ state: { kind: 'ac', state, lastSent: true } }));
    expect(v.source).toBe('lastSent');
    expect(v.state).toEqual(state);
    expect('roomTemp' in v).toBe(false);
  });

  it('falls back to the default state', () => {
    expect(acView(view())).toMatchObject({ state: defaultAcState(), source: 'none' });
  });

  it('carries the capabilities', () => {
    const capabilities: Capabilities = { swing: true };
    expect(acView(view({ capabilities })).caps).toBe(capabilities);
  });
});

describe('nextAc', () => {
  const on = { ...defaultAcState(), power: true };

  it('clamps the setpoint to the default range', () => {
    expect(nextAc({ ...on, setpoint: 30 }, { setpoint: 31 }, {}).setpoint).toBe(30);
    expect(nextAc({ ...on, setpoint: 16 }, { setpoint: 15 }, {}).setpoint).toBe(16);
  });

  it('clamps to the capability range', () => {
    expect(nextAc(on, { setpoint: 40 }, { setpoint: { min: 18, max: 28 } }).setpoint).toBe(28);
  });

  it('keeps the other fields on a mode change', () => {
    expect(nextAc({ ...on, fan: 2, swing: true }, { mode: 'dry' }, {})).toEqual({
      ...on,
      fan: 2,
      swing: true,
      mode: 'dry',
    });
  });

  it('turns Quiet off when Powerful goes on, and the other way round', () => {
    expect(nextAc({ ...on, quiet: true }, { powerful: true }, {})).toMatchObject({
      powerful: true,
      quiet: false,
    });
    expect(nextAc({ ...on, powerful: true }, { quiet: true }, {})).toMatchObject({
      powerful: false,
      quiet: true,
    });
    expect(nextAc({ ...on, powerful: true }, { powerful: false }, {})).toMatchObject({
      powerful: false,
    });
  });

  it('keeps the old swing flag in step with a vertical position', () => {
    expect(nextAc({ ...on, swing: true }, { swingV: 2 }, {})).toMatchObject({
      swing: false,
      swingV: 2,
    });
    expect(nextAc({ ...on, swing: false, swingV: 4 }, { swingV: 'auto' }, {})).toMatchObject({
      swing: true,
      swingV: 'auto',
    });
  });

  it('moves a known vertical position with the Swing chip', () => {
    expect(nextAc({ ...on, swing: false, swingV: 4 }, { swing: true }, {})).toMatchObject({
      swing: true,
      swingV: 'auto',
    });
    expect(nextAc({ ...on, swing: true, swingV: 'auto' }, { swing: false }, {})).toMatchObject({
      swing: false,
      swingV: 3,
    });
  });

  it('adds no new fields to a state that has none', () => {
    expect(nextAc(on, { swing: true }, {})).toEqual({ ...on, swing: true });
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
