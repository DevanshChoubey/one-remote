import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Device } from '@/core';
import { DeviceHub } from '@/device/hub';
import { createAsyncStorageStore } from '@/store/asyncStorageStore';
import { createAsyncStoragePreferenceStore } from '@/store/preferences';
import { createSecureSecretStore } from '@/store/secrets';
import type { Services } from './services';

/** Keeps the hub's device list equal to the store's; applies the newest read that succeeded. */
function syncHub(hub: DeviceHub, store: Services['store']): void {
  let issued = 0;
  let applied = 0;
  const load = (): void => {
    const mine = ++issued;
    store.devices().then(
      (devices: Device[]) => {
        if (mine < applied) return;
        applied = mine;
        hub.setDevices(devices);
      },
      (e: unknown) => console.error('Could not load devices into the hub', e),
    );
  };
  store.subscribe(load);
  load();
}

/** Runs one cleanup step; a failure (sync or async) is logged and never blocks the removal. */
function bestEffort(what: string, job: () => Promise<void>): Promise<void> {
  try {
    return job().catch((e: unknown) => console.error(`Could not ${what}`, e));
  } catch (e) {
    console.error(`Could not ${what}`, e);
    return Promise.resolve();
  }
}

/**
 * Removes a device from the store, then lets each link's driver forget it (secrets, fabric,
 * per-node data) and deletes the webOS client key. The cleanup is best effort: a failure is logged
 * and the device stays removed.
 */
function removeDeviceWith(
  store: Services['store'],
  secrets: Services['secrets'],
  drivers: Services['drivers'],
): Services['removeDevice'] {
  return async (id) => {
    const device = (await store.devices()).find((d) => d.id === id);
    await store.removeDevice(id);
    if (!device) return;
    await Promise.all(
      device.links.flatMap((link) => {
        const jobs: Promise<void>[] = [];
        const driver = drivers.find((d) => d.kind === link.kind);
        const forget = driver?.forget?.bind(driver);
        if (forget) jobs.push(bestEffort(`forget a ${link.kind} link`, () => forget(device, link)));
        if (link.kind === 'webos') {
          jobs.push(bestEffort('delete a device secret', () => secrets.delete(link.clientKeyRef)));
        }
        return jobs;
      }),
    );
  };
}

/**
 * Builds the app's services. Pass any part to replace it (tests pass memory stores and fake
 * drivers). Lanes add their driver to `drivers` below and their setup object to the result.
 */
export function createServices(deps: Partial<Services> = {}): Services {
  const drivers = deps.drivers ?? [];
  const hub = deps.hub ?? new DeviceHub({ drivers });
  const store = deps.store ?? createAsyncStorageStore(AsyncStorage);
  const secrets = deps.secrets ?? createSecureSecretStore();
  const prefs = deps.prefs ?? createAsyncStoragePreferenceStore(AsyncStorage);
  syncHub(hub, store);
  const removeDevice = deps.removeDevice ?? removeDeviceWith(store, secrets, drivers);
  return { hub, store, secrets, prefs, drivers, removeDevice };
}
