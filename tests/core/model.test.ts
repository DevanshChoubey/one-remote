import { DeviceError, clampSetpoint, defaultAcState, isIdempotent } from '@/core';

describe('core model', () => {
  it('treats key presses as non-idempotent', () => {
    expect(isIdempotent({ kind: 'tv.key', key: 'ok' })).toBe(false);
  });

  it('treats absolute state sets as idempotent', () => {
    expect(isIdempotent({ kind: 'ac.set', state: defaultAcState() })).toBe(true);
  });

  it('clamps setpoints to the default 16..30 range', () => {
    expect(clampSetpoint(40)).toBe(30);
    expect(clampSetpoint(10)).toBe(16);
  });

  it('clamps setpoints to the capability range when given', () => {
    expect(clampSetpoint(20, { setpoint: { min: 18, max: 28 } })).toBe(20);
    expect(clampSetpoint(30, { setpoint: { min: 18, max: 28 } })).toBe(28);
  });

  it('returns the documented default AC state', () => {
    expect(defaultAcState()).toEqual({
      power: false,
      mode: 'cool',
      setpoint: 24,
      fan: 'auto',
      swing: false,
      sleep: false,
    });
  });

  it('creates a DeviceError that is an Error with its code', () => {
    const err = new DeviceError('timeout');
    expect(err.code).toBe('timeout');
    expect(err.name).toBe('DeviceError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DeviceError);
  });
});
