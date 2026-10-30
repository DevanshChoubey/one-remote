import { clampSetpoint, type Capabilities } from '@/core';

describe('Capabilities fan fields', () => {
  it('are optional: an existing Capabilities value without them still types and works', () => {
    const caps: Capabilities = { fanLight: true };
    expect(caps.fanBoost).toBeUndefined();
    expect(caps.fanTimer).toBeUndefined();
    expect(clampSetpoint(40, caps)).toBe(30);
    const withThem: Capabilities = { fanBoost: false, fanTimer: false };
    expect(withThem.fanBoost).toBe(false);
  });
});
