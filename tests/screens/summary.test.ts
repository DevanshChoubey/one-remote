import { defaultAcState } from '@/core';
import type { Device } from '@/core';
import type { DeviceView } from '@/services';
import { cardSummary } from '@/screens/home/summary';

const base = { roomId: 'r', order: 0, links: [] };
function view(device: Device, state?: DeviceView['state']): DeviceView {
  return { device, usable: true, status: { via: null, fellBack: false }, state, capabilities: {} };
}
const ac: Device = { ...base, id: 'a', kind: 'ac', name: 'AC' };
const fan: Device = { ...base, id: 'f', kind: 'fan', name: 'Fan' };
const tv: Device = { ...base, id: 't', kind: 'tv', name: 'TV' };

describe('cardSummary', () => {
  it('describes an AC that is on and one that is off', () => {
    const on = { ...defaultAcState(), power: true, setpoint: 24 };
    expect(cardSummary(view(ac, { kind: 'ac', state: on }))).toBe('Cool · 24°');
    expect(cardSummary(view(ac, { kind: 'ac', state: { ...on, power: false } }))).toBe('Off');
  });

  it('describes a fan by speed, or Off', () => {
    const f = {
      power: true,
      speed: 3 as const,
      boost: false,
      sleep: false,
      timerHours: 0 as const,
    };
    expect(cardSummary(view(fan, { kind: 'fan', state: f, lastSent: true }))).toBe('Speed 3');
    expect(
      cardSummary(view(fan, { kind: 'fan', state: { ...f, power: false }, lastSent: true })),
    ).toBe('Off');
  });

  it('describes a TV by app and volume', () => {
    expect(
      cardSummary(view(tv, { kind: 'tv', state: { power: true, app: 'Netflix', volume: 18 } })),
    ).toBe('Netflix · Vol 18');
    expect(cardSummary(view(tv, { kind: 'tv', state: { power: true } }))).toBe('On');
    expect(cardSummary(view(tv, { kind: 'tv', state: { power: false } }))).toBe('Off');
  });

  it('is empty when nothing is known', () => {
    expect(cardSummary(view(tv))).toBe('');
  });
});
