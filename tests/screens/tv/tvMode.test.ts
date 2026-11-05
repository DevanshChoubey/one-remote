import type { DeviceView } from '@/device/hub';
import { tvMode } from '@/screens/tv/tvMode';

const view = (power?: boolean): DeviceView => ({
  device: { id: 'tv1', kind: 'tv', name: 'TV', roomId: 'r', order: 0, links: [] },
  usable: true,
  status: { via: null, fellBack: false },
  ...(power === undefined ? {} : { state: { kind: 'tv' as const, state: { power } } }),
  capabilities: {},
});

const env = { onWifi: true, openedAt: 0, now: 1000 };

describe('tvMode', () => {
  it('is unreachable off Wi-Fi, whatever else is known', () => {
    expect(tvMode(view(true), { ...env, onWifi: false })).toBe('unreachable');
  });
  it('is ready when the TV reports power on', () => {
    expect(tvMode(view(true), env)).toBe('ready');
    expect(tvMode(view(true), { ...env, wakeSentAt: 0 })).toBe('ready');
  });
  it('is waking for 45 s after a wake was sent (the LG C4 takes about 20 s to boot)', () => {
    expect(tvMode(view(false), { ...env, wakeSentAt: 0, now: 44999 })).toBe('waking');
    expect(tvMode(view(), { ...env, wakeSentAt: 0, now: 5000 })).toBe('waking');
  });
  it('is wakeFailed after 45 s', () => {
    expect(tvMode(view(false), { ...env, wakeSentAt: 0, now: 45001 })).toBe('wakeFailed');
  });
  it('is off when the TV reports power off', () => {
    expect(tvMode(view(false), env)).toBe('off');
  });
  it('is connecting for 5 s with no report', () => {
    expect(tvMode(view(), { ...env, now: 4999 })).toBe('connecting');
  });
  it('is unreachable after 5 s with no report', () => {
    expect(tvMode(view(), { ...env, now: 5000 })).toBe('unreachable');
  });
  it('treats no view yet as no report', () => {
    expect(tvMode(null, env)).toBe('connecting');
  });
});
