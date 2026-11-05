import { createFakeAerService } from '@/aer/testing/fakeAerService';
import type { Device } from '@/core';
import { createServices } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { AerError } from '@/aer/errors';

const dev: Device = {
  id: 'a1',
  kind: 'aer',
  name: 'Air freshener',
  roomId: 'r',
  order: 0,
  links: [{ kind: 'aer', bleId: 'AA:BB', timeZone: 'UTC' }],
};

async function setup() {
  const store = createMemoryStore();
  const aer = createFakeAerService();
  const services = createServices({
    store,
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [],
    aer,
  });
  await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
  await store.upsertDevice(dev);
  return { store, aer, services };
}

describe('removeDevice for an air freshener', () => {
  it('removes it and asks the service to forget it once', async () => {
    const { store, aer, services } = await setup();
    await services.removeDevice('a1');
    expect(await store.devices()).toEqual([]);
    expect(aer.calls).toEqual([{ op: 'forget', deviceId: 'a1' }]);
  });

  it('logs a failed forget and keeps the device removed', async () => {
    const { store, aer, services } = await setup();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    aer.failNext('forget', new AerError('disconnected'));
    await expect(services.removeDevice('a1')).resolves.toBeUndefined();
    expect(await store.devices()).toEqual([]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));
