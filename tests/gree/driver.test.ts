import { DeviceError, defaultAcState } from '@/core';
import type { AcState, Device, Reported } from '@/core';
import { DeviceHub } from '@/device/hub';
import { createGreeClient } from '@/gree/client';
import { createGreeDriver } from '@/gree/driver';
import type { GreeLink } from '@/gree/driver';
import { FakeGreeUnit, createFakeGreeLan } from '@/gree/testing/fakeGree';

const MAC = 'f4911e000001';
const KEY = 'Dk3Lm9Pq2Rs7Tu1V';
const LINK: GreeLink = { kind: 'gree', mac: MAC, host: '192.168.1.40', key: KEY, cipher: 'ecb' };
const AC: Device = { id: 'ac1', kind: 'ac', name: 'AC', roomId: 'r', order: 0, links: [LINK] };
const ON: AcState = { power: true, mode: 'cool', setpoint: 23, fan: 1, swing: false, sleep: true };

function setup(opts: { pollMs?: number } = {}) {
  const unit = new FakeGreeUnit({ mac: MAC, host: LINK.host, key: KEY });
  const lan = createFakeGreeLan([unit]);
  const saved: [string, GreeLink][] = [];
  const driver = createGreeDriver({
    client: createGreeClient({ udp: lan }),
    pollMs: opts.pollMs ?? 1000,
    scanMs: 10,
    onLinkChanged: (id, link) => {
      saved.push([id, link]);
      return Promise.resolve();
    },
  });
  return { unit, lan, driver, saved };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('Gree driver', () => {
  it('carries ac.set for ACs on a Gree link only', () => {
    const { driver } = setup();
    const set = { kind: 'ac.set' as const, state: ON };
    expect(driver.kind).toBe('gree');
    expect(driver.available()).toBe(true);
    expect(driver.supports(AC, LINK, set)).toBe(true);
    expect(driver.supports({ ...AC, kind: 'fan' }, LINK, set)).toBe(false);
    expect(driver.supports(AC, { kind: 'ir', remoteId: 'x' }, set)).toBe(false);
    expect(driver.supports(AC, LINK, { kind: 'tv.key', key: 'ok' })).toBe(false);
    expect(driver.capabilities(AC, LINK)).toMatchObject({ swing: true, sleep: true });
    expect(
      createGreeDriver({
        client: createGreeClient({ udp: setup().lan }),
        enabled: false,
      }).available(),
    ).toBe(false);
  });

  it('sets the whole state on the unit', async () => {
    const { driver, unit } = setup();
    await driver.send(AC, LINK, { kind: 'ac.set', state: ON });
    expect(unit.params).toMatchObject({ Pow: 1, Mod: 1, SetTem: 23, WdSpd: 1, SwhSlp: 1 });
  });

  it('refuses what it cannot carry and sends nothing once aborted', async () => {
    const { driver, lan } = setup();
    await expect(
      driver.send(AC, { kind: 'ir', remoteId: 'x' }, { kind: 'ac.set', state: ON }),
    ).rejects.toMatchObject({ code: 'noLink' });
    await expect(driver.send(AC, LINK, { kind: 'tv.powerOn' })).rejects.toMatchObject({
      code: 'unsupported',
    });
    const c = new AbortController();
    c.abort();
    await expect(
      driver.send(AC, LINK, { kind: 'ac.set', state: ON }, c.signal),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(lan.sent).toHaveLength(0);
  });

  it('reports the real state when watched, then polls, and tells after a send', async () => {
    jest.useFakeTimers();
    const { driver, unit } = setup({ pollMs: 1000 });
    unit.params.Pow = 1;
    unit.params.Mod = 3;
    const seen: Reported[] = [];
    const stop = driver.observe?.(AC, LINK, (r) => seen.push(r));
    await jest.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toEqual({
      kind: 'ac',
      state: { ...defaultAcState(), power: true, mode: 'fan' },
      roomTemp: 26,
    });
    unit.params.SetTem = 27;
    await jest.advanceTimersByTimeAsync(1000);
    expect(seen.at(-1)).toMatchObject({ state: { setpoint: 27 } });
    await driver.send(AC, LINK, { kind: 'ac.set', state: ON });
    expect(seen.at(-1)).toEqual({ kind: 'ac', state: ON, roomTemp: 26 });
    stop?.();
    const count = seen.length;
    await jest.advanceTimersByTimeAsync(5000);
    expect(seen).toHaveLength(count);
  });

  it('binds again after a reset and saves the new key', async () => {
    const { driver, unit, saved } = setup();
    unit.reset('Nw4Ky8Bc1Df5Gh9J');
    // The unit ignores the old key: the send times out, and the driver binds again behind it.
    await expect(driver.send(AC, LINK, { kind: 'ac.set', state: ON })).rejects.toMatchObject({
      code: 'timeout',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(saved).toEqual([['ac1', { ...LINK, key: 'Nw4Ky8Bc1Df5Gh9J' }]]);
    await driver.send(AC, LINK, { kind: 'ac.set', state: ON });
    expect(unit.params.Pow).toBe(1);
  });

  it('finds a unit that moved to a new address', async () => {
    const { driver, unit, saved } = setup();
    unit.host = '192.168.1.77';
    await expect(driver.send(AC, LINK, { kind: 'ac.set', state: ON })).rejects.toMatchObject({
      code: 'timeout',
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(saved).toEqual([['ac1', { ...LINK, host: '192.168.1.77' }]]);
    // Until the store saves it, the driver already uses the new address.
    await driver.send(AC, LINK, { kind: 'ac.set', state: ON });
    expect(unit.params.Pow).toBe(1);
  });

  it('does not search again and again for a unit that is off', async () => {
    const { driver, unit, lan } = setup();
    unit.up = false;
    await expect(driver.send(AC, LINK, { kind: 'ac.set', state: ON })).rejects.toBeInstanceOf(
      DeviceError,
    );
    await new Promise((r) => setTimeout(r, 20));
    await expect(driver.send(AC, LINK, { kind: 'ac.set', state: ON })).rejects.toBeInstanceOf(
      DeviceError,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(lan.sent.filter(([to]) => to === 'scan')).toHaveLength(1);
  });

  it('works under the hub: falls back to IR when the unit is gone', async () => {
    const { driver, unit } = setup();
    const ir = {
      kind: 'ir' as const,
      sent: 0,
      available: () => true,
      supports: () => true,
      capabilities: () => ({}),
      send(): Promise<void> {
        this.sent++;
        return Promise.resolve();
      },
    };
    const hub = new DeviceHub({ drivers: [driver, ir], backoffMs: [0] });
    const device: Device = { ...AC, links: [LINK, { kind: 'ir', remoteId: 'gree/yaa' }] };
    hub.setDevices([device]);
    await expect(hub.send('ac1', { kind: 'ac.set', state: ON })).resolves.toEqual({
      via: 'gree',
      fellBack: false,
    });
    unit.up = false;
    await expect(hub.send('ac1', { kind: 'ac.set', state: ON })).resolves.toEqual({
      via: 'ir',
      fellBack: true,
    });
    expect(ir.sent).toBe(1);
  });

  it('forgets a unit', async () => {
    const { driver } = setup();
    await expect(driver.forget?.(AC, LINK)).resolves.toBeUndefined();
    await expect(driver.forget?.(AC, { kind: 'ir', remoteId: 'x' })).resolves.toBeUndefined();
  });
});
