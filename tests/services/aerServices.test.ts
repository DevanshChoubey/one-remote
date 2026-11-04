import { createFakeScheduler } from '@/aer/alerts/testing/fakeScheduler';
import { createFakeAlerts } from '@/aer/testing/fakeAlerts';
import { createFakeTransport } from '@/aer/testing/fakeDispenser';
import type { Device } from '@/core';
import { createServices } from '@/services';
import { startAfter } from '@/services/createServices';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const BLE = 'AA:01';
const dispenser: Device = {
  id: 'a1',
  kind: 'aer',
  name: 'Hall',
  roomId: 'r',
  order: 0,
  links: [{ kind: 'aer', bleId: BLE, timeZone: 'Asia/Kolkata' }],
};

/** Retries `check` until it passes or the attempts run out (the alerts sync in the background). */
async function eventually(check: () => Promise<void>, attempts = 50): Promise<void> {
  for (let i = 1; ; i += 1) {
    try {
      await check();
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

describe('createServices aer wiring', () => {
  it('wires the aer to the home store and the alerts', async () => {
    const store = createMemoryStore();
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    const transport = createFakeTransport({ [BLE]: {} });
    // 1900 of 2200 sprays used and a spray every 10 minutes: under 10% left by tomorrow morning,
    // so the refill alert is planned for later and stays pending.
    transport.state(BLE).spraysSinceRefill = 1900;
    transport.state(BLE).autoSpray = 10;
    const scheduler = createFakeScheduler(() => new Date());
    scheduler.setPermission('granted');
    const services = createServices({
      store,
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
      drivers: [],
      bleTransport: transport,
      aerScheduler: scheduler,
    });
    const stop = services.aerAlerts.start();

    await services.aer.add(dispenser);
    expect((await store.devices()).map((d) => d.id)).toEqual(['a1']);
    await eventually(async () => {
      expect(await services.aerAlerts.pendingKeys()).toContain('a1:refillLow');
    });

    await services.removeDevice('a1');
    await eventually(async () => {
      expect(await services.aerAlerts.pendingKeys()).toEqual([]);
    });
    stop();
    await services.aer.closeAll();
  });
});

describe('createServices dev-only aerDispensers', () => {
  const build = () =>
    createServices({
      store: createMemoryStore(),
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
      drivers: [],
      bleTransport: createFakeTransport({}),
      aerScheduler: createFakeScheduler(() => new Date()),
    });

  it('exposes the readings store in dev', () => {
    expect(build().aerDispensers).toBeDefined();
  });

  it('leaves it undefined in a release build', () => {
    const g = globalThis as unknown as { __DEV__: boolean };
    const was = g.__DEV__;
    g.__DEV__ = false;
    try {
      expect(build().aerDispensers).toBeUndefined();
    } finally {
      g.__DEV__ = was;
    }
  });
});

describe('startAfter', () => {
  const alertsWith = (start: jest.Mock) => ({ ...createFakeAlerts(), start });

  it('starts the alerts only once the aer cache has loaded, and stops them', async () => {
    let finish: () => void = () => undefined;
    const load = jest.fn(() => new Promise<void>((r) => (finish = r)));
    const innerStop = jest.fn();
    const start = jest.fn(() => innerStop);
    const stop = startAfter(load, alertsWith(start)).start();
    await Promise.resolve();
    expect(start).not.toHaveBeenCalled();
    finish();
    await eventually(async () => expect(start).toHaveBeenCalledTimes(1));
    stop();
    expect(innerStop).toHaveBeenCalledTimes(1);
  });

  it('never starts the alerts when stopped before the load ends', async () => {
    let finish: () => void = () => undefined;
    const start = jest.fn(() => () => undefined);
    const stop = startAfter(
      () => new Promise<void>((r) => (finish = r)),
      alertsWith(start),
    ).start();
    stop();
    finish();
    await new Promise((r) => setTimeout(r, 10));
    expect(start).not.toHaveBeenCalled();
  });

  it('logs a failed load and starts the alerts anyway', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const start = jest.fn(() => () => undefined);
    startAfter(() => Promise.reject(new Error('disk')), alertsWith(start)).start();
    await eventually(async () => expect(start).toHaveBeenCalledTimes(1));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
