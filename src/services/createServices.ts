import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Device } from '@/core';
import { DeviceHub } from '@/device/hub';
import { createAsyncStorageStore } from '@/store/asyncStorageStore';
import { createAsyncStoragePreferenceStore } from '@/store/preferences';
import { createSecureSecretStore } from '@/store/secrets';
import type { Services } from './services';

/** Keeps the hub's device list equal to the store's; the latest read wins. */
function syncHub(hub: DeviceHub, store: Services['store']): void {
  let latest = 0;
  const load = (): void => {
    const mine = ++latest;
    store.devices().then(
      (devices: Device[]) => {
        if (mine === latest) hub.setDevices(devices);
      },
      (e: unknown) => console.error('Could not load devices into the hub', e),
    );
  };
  store.subscribe(load);
  load();
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
  return { hub, store, secrets, prefs, drivers };
}
