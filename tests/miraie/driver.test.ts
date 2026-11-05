import { DeviceError } from '@/core';
import type { AcState, Device, Link, LinkDriver, Reported } from '@/core';
import { DeviceHub } from '@/device/hub';
import { createMiraieApi } from '@/miraie/api';
import { createMiraieDriver } from '@/miraie/driver';
import { CloudNetError } from '@/miraie/net';
import type { CloudNet } from '@/miraie/net';
import { createMiraieSession } from '@/miraie/session';
import type { MiraieSession } from '@/miraie/session';
import { createFakeMiraie, topicOf } from '@/miraie/testing/fakeMiraie';
import { createMemorySecretStore } from '@/store/secrets';

jest.mock('expo-secure-store', () => ({}));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const cool24: AcState = {
  power: true,
  mode: 'cool',
  setpoint: 24,
  fan: 'auto',
  swing: true,
  sleep: false,
};

const live: MiraieSession[] = [];
afterEach(async () => {
  await Promise.all(live.splice(0).map((s) => s.disconnect()));
});

async function setup(o: { signIn?: boolean } = {}) {
  const fake = createFakeMiraie();
  let session: MiraieSession | undefined;
  const allowed = (): boolean => session?.netAllowed() ?? false;
  const net: CloudNet = {
    request: (r) =>
      allowed() ? fake.cloud.net.request(r) : Promise.reject(new CloudNetError('off')),
    openTls: (h, p, t) =>
      allowed() ? fake.cloud.net.openTls(h, p, t) : Promise.reject(new CloudNetError('off')),
  };
  const api = createMiraieApi({ net });
  let optIn = false;
  session = createMiraieSession({
    api,
    net,
    secrets: createMemorySecretStore(),
    loadOptIn: () => Promise.resolve(optIn),
    saveOptIn: (v) => {
      optIn = v;
      return Promise.resolve();
    },
    clientId: () => 'oneremote-test',
    connectTimeoutMs: 1000,
  });
  live.push(session);
  if (o.signIn !== false) await session.signIn(fake.account.phone, fake.account.password);
  const driver = createMiraieDriver({ session, api, backoffMs: [10, 10] });
  const link: Link = {
    kind: 'miraie',
    deviceId: 'dev1',
    homeId: fake.account.homeId,
    topic: topicOf(fake.account, 'dev1'),
  };
  const device: Device = {
    id: 'ac1',
    kind: 'ac',
    name: 'AC',
    roomId: 'r',
    order: 0,
    links: [link],
  };
  return { ...fake, session, driver, link, device, api };
}

const control = (published: { topic: string; text: string }[]) =>
  published
    .filter((p) => p.topic.endsWith('/control'))
    .map((p) => {
      const { ki: _k, cnt: _c, sid: _s, ...rest } = JSON.parse(p.text) as Record<string, unknown>;
      return rest;
    });

describe('miraie driver', () => {
  it('is available only when signed in and on', async () => {
    const off = await setup({ signIn: false });
    expect(off.driver.available()).toBe(false);
    const on = await setup();
    expect(on.driver.available()).toBe(true);
    expect(on.driver.supports(on.device, on.link, { kind: 'ac.set', state: cool24 })).toBe(true);
    expect(on.driver.capabilities(on.device, on.link)).toMatchObject({ sleep: false, swing: true });
  });

  it('sends ac.set as control messages, and then only what changed', async () => {
    const { driver, device, link, cloud, account } = await setup();
    await driver.send(device, link, { kind: 'ac.set', state: cool24 });
    expect(cloud.broker.published[0]?.topic).toBe(`${topicOf(account, 'dev1')}/control`);
    expect(control(cloud.broker.published)).toEqual([
      { ps: 'on' },
      { acmd: 'cool' },
      { actmp: '24.0' },
      { acfs: 'auto' },
      { acvs: 0 },
    ]);
    cloud.broker.published.length = 0;
    await driver.send(device, link, { kind: 'ac.set', state: { ...cool24, setpoint: 22 } });
    expect(control(cloud.broker.published)).toEqual([{ actmp: '22.0' }]);
  });

  it('refuses when signed out, so the hub can fall back to IR', async () => {
    const { driver, device, link } = await setup({ signIn: false });
    await expect(
      driver.send(device, link, { kind: 'ac.set', state: cool24 }),
    ).rejects.toMatchObject({ code: 'notPaired' });
  });

  it('says notSent when the broker cannot be reached, and sends nothing late', async () => {
    const { driver, device, link, cloud } = await setup();
    cloud.tlsFailWith = new CloudNetError('failed');
    await expect(
      driver.send(device, link, { kind: 'ac.set', state: cool24 }),
    ).rejects.toMatchObject({ code: 'notSent' });
    cloud.tlsFailWith = null;
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      driver.send(device, link, { kind: 'ac.set', state: cool24 }, ctl.signal),
    ).rejects.toEqual(new DeviceError('timeout'));
    expect(cloud.broker.published).toEqual([]);
  });

  it('reads the state back from the status call and the status topic', async () => {
    const { driver, device, link, cloud, account } = await setup();
    const got: Reported[] = [];
    const stop = driver.observe?.(device, link, (r) => got.push(r));
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    await flush();
    expect(got[0]).toEqual({ kind: 'ac', state: { ...cool24, swingV: 'auto' }, roomTemp: 27.5 });
    cloud.broker.send(`${topicOf(account, 'dev1')}/status`, '{"actmp":"26.0","acfs":"low"}');
    await flush();
    expect(got.at(-1)).toEqual({
      kind: 'ac',
      state: { ...cool24, swingV: 'auto', setpoint: 26, fan: 1 },
    });
    // What it reported is the base for the next send.
    cloud.broker.published.length = 0;
    await driver.send(device, link, { kind: 'ac.set', state: { ...cool24, setpoint: 26, fan: 1 } });
    expect(control(cloud.broker.published)).toEqual([]);
    stop?.();
  });

  it('lets IR take over while the AC is offline', async () => {
    const { driver, device, link, cloud, account } = await setup();
    const stop = driver.observe?.(device, link, () => undefined);
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    await flush();
    cloud.broker.send(`${topicOf(account, 'dev1')}/connectionStatus`, '{"onlineStatus":"false"}');
    await flush();
    await expect(
      driver.send(device, link, { kind: 'ac.set', state: cool24 }),
    ).rejects.toMatchObject({ code: 'notSent' });
    stop?.();
  });

  it('reconnects after the broker drops the session', async () => {
    const { driver, device, link, cloud } = await setup();
    const stop = driver.observe?.(device, link, () => undefined);
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    await flush();
    expect(cloud.tlsOpens).toHaveLength(1);
    cloud.broker.dropAll();
    await flush();
    await new Promise((r) => setTimeout(r, 30));
    await flush();
    expect(cloud.tlsOpens).toHaveLength(2);
    expect(cloud.broker.openSessions).toBe(1);
    stop?.();
  });

  it('falls back to the IR link in the hub when MirAIe is off', async () => {
    const { driver, device, link } = await setup({ signIn: false });
    const sent: string[] = [];
    const ir: LinkDriver = {
      kind: 'ir',
      available: () => true,
      supports: () => true,
      capabilities: () => ({}),
      send: async () => {
        sent.push('ir');
      },
    };
    const irLink: Link = { kind: 'ir', remoteId: 'panasonic-ac/dke' };
    const hub = new DeviceHub({ drivers: [driver, ir] });
    hub.setDevices([{ ...device, links: [link, irLink] }]);
    const r = await hub.send(device.id, { kind: 'ac.set', state: cool24 });
    expect(r.via).toBe('ir');
    expect(sent).toEqual(['ir']);
  });
});
