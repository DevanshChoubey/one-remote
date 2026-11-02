import type { Device } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { createServices } from '@/services';
import { createFakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv } from '@/samsung/testing/fakeTv';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';

const d: Device = {
  id: 'a1',
  kind: 'ac',
  name: 'AC',
  roomId: 'r',
  order: 0,
  links: [{ kind: 'matter', nodeId: 'n' }],
};
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function make(driver = createFakeDriver('matter')) {
  const store = createMemoryStore();
  const services = createServices({
    store,
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [driver],
  });
  return { store, services, driver };
}

describe('createServices', () => {
  it('loads stored devices into the hub and follows later changes', async () => {
    const store = createMemoryStore();
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(d);
    const services = createServices({
      store,
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
      drivers: [createFakeDriver('matter')],
    });
    await flush();
    expect(services.hub.view('a1').device.name).toBe('AC');
    await store.upsertDevice({ ...d, name: 'Renamed' });
    await flush();
    expect(services.hub.view('a1').device.name).toBe('Renamed');
    await store.removeDevice('a1');
    await flush();
    expect(() => services.hub.view('a1')).toThrow();
  });

  it('refreshes observing when a driver becomes available later', async () => {
    const driver = createFakeDriver('matter', { available: false });
    const { store, services } = make(driver);
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(d);
    await flush();
    const cb = jest.fn();
    services.hub.subscribe('a1', cb);
    driver.setAvailable(true);
    services.hub.refresh();
    driver.emit('a1', {
      kind: 'ac',
      state: { power: true, mode: 'cool', setpoint: 24, fan: 'auto', swing: false, sleep: false },
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('has the lanes drivers by default (webos, androidtv, samsung, ir so far)', () => {
    const s = createServices({
      store: createMemoryStore(),
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
    });
    expect(s.drivers.map((x) => x.kind)).toEqual(['webos', 'androidtv', 'samsung', 'ir']);
  });
});

describe('services.removeDevice', () => {
  const tv: Device = {
    id: 't1',
    kind: 'tv',
    name: 'TV',
    roomId: 'r',
    order: 0,
    links: [
      { kind: 'webos', host: '192.168.1.20', secure: true, clientKeyRef: 'ck' },
      { kind: 'ir', remoteId: 'lg-tv/akb' },
    ],
  };

  function withDrivers(forgetWebos: jest.Mock, forgetIr?: jest.Mock) {
    const webos = { ...createFakeDriver('webos'), forget: forgetWebos };
    const ir = forgetIr ? { ...createFakeDriver('ir'), forget: forgetIr } : createFakeDriver('ir');
    const store = createMemoryStore();
    const secrets = createMemorySecretStore();
    const services = createServices({
      store,
      secrets,
      prefs: createMemoryPreferenceStore(),
      drivers: [webos, ir],
    });
    return { store, secrets, services };
  }

  it('removes the device, then asks each link driver to forget its link', async () => {
    const order: string[] = [];
    const forgetWebos = jest.fn(async () => {
      order.push('forget');
    });
    const forgetIr = jest.fn(async () => undefined);
    const { store, services } = withDrivers(forgetWebos, forgetIr);
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(tv);
    const remove = store.removeDevice.bind(store);
    jest.spyOn(store, 'removeDevice').mockImplementation(async (id) => {
      order.push('remove');
      await remove(id);
    });
    await services.removeDevice('t1');
    expect(await store.devices()).toEqual([]);
    expect(forgetWebos).toHaveBeenCalledWith(tv, tv.links[0]);
    expect(forgetIr).toHaveBeenCalledWith(tv, tv.links[1]);
    expect(order).toEqual(['remove', 'forget']);
  });

  it('still removes the device when a forget fails, and logs it', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const forgetIr = jest.fn(async () => undefined);
    const { store, services } = withDrivers(
      jest.fn(async () => {
        throw new Error('fabric gone');
      }),
      forgetIr,
    );
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(tv);
    await expect(services.removeDevice('t1')).resolves.toBeUndefined();
    expect(await store.devices()).toEqual([]);
    expect(forgetIr).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('tolerates a forget that throws synchronously', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, services } = withDrivers(
      jest.fn(() => {
        throw new Error('sync');
      }),
    );
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(tv);
    await services.removeDevice('t1');
    expect(await store.devices()).toEqual([]);
    err.mockRestore();
  });

  it('deletes the webos client key too', async () => {
    const { store, secrets, services } = withDrivers(jest.fn(async () => undefined));
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(tv);
    await secrets.set('ck', 'secret');
    await services.removeDevice('t1');
    expect(await secrets.get('ck')).toBeNull();
  });

  it('does not forget anything when the store write fails', async () => {
    const forgetWebos = jest.fn(async () => undefined);
    const { store, services } = withDrivers(forgetWebos);
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(tv);
    jest.spyOn(store, 'removeDevice').mockRejectedValue(new Error('disk'));
    await expect(services.removeDevice('t1')).rejects.toThrow('disk');
    expect(forgetWebos).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown device', async () => {
    const forgetWebos = jest.fn(async () => undefined);
    const { services } = withDrivers(forgetWebos);
    await services.removeDevice('nope');
    expect(forgetWebos).not.toHaveBeenCalled();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

describe('Samsung wiring', () => {
  const HOST = '192.168.1.40';
  const MAC = 'aa:bb:cc:dd:ee:ff';
  const PROMPTS = { onAllow: () => undefined, askCode: () => Promise.resolve(null) };
  const samsungDevice = (tokenRef: string): Device => ({
    id: 's1',
    kind: 'tv',
    name: 'Samsung',
    roomId: 'r',
    order: 0,
    links: [{ kind: 'samsung', host: HOST, mac: MAC, tokenRef, pinSha256: 'old' }],
  });

  async function rig() {
    const tv = createFakeSamsungTv({ host: HOST, mac: MAC, prompt: 'allow' });
    const store = createMemoryStore();
    const secrets = createMemorySecretStore();
    const services = createServices({
      tvTransport: createFakeSamsungLan([tv]),
      store,
      secrets,
      prefs: createMemoryPreferenceStore(),
    });
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await secrets.set('samsung:1', 'old-token');
    await store.upsertDevice(samsungDevice('samsung:1'));
    return { tv, store, secrets, services };
  }

  it('re-pairing releases the Samsung driver, not the webos one', async () => {
    const { services } = await rig();
    const samsung = services.drivers.find((d) => d.kind === 'samsung');
    const webos = services.drivers.find((d) => d.kind === 'webos');
    const clearSamsung = jest.spyOn(samsung as never, 'clearNotPaired');
    const clearWebos = jest.spyOn(webos as never, 'clearNotPaired');
    const reuse = {
      kind: 'samsung' as const,
      host: HOST,
      mac: MAC,
      tokenRef: 'samsung:1',
      pinSha256: 'old',
    };
    await services.tv.pair(
      { kind: 'samsung', host: HOST, name: 'Samsung TV', secure: true },
      PROMPTS,
      reuse,
    );
    expect(clearSamsung).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ kind: 'samsung', tokenRef: 'samsung:1' }),
    );
    expect(clearWebos).not.toHaveBeenCalled();
  });

  it('removing a Samsung device forgets its token', async () => {
    const { secrets, services } = await rig();
    await services.removeDevice('s1');
    expect(await secrets.get('samsung:1')).toBeNull();
  });
});
