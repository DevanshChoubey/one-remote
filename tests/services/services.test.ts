import type { Device } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { createServices } from '@/services';
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

  it('has no drivers by default (lanes add them)', () => {
    const s = createServices({
      store: createMemoryStore(),
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
    });
    expect(s.drivers).toEqual([]);
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
