import { withTvHost, type Device } from '@/core';

/** The slice of the store that `tvHostChanged` needs. */
interface HostStore {
  devices(): Promise<Device[]>;
  upsertDevice(device: Device): Promise<void>;
}

/** The TV was found at a new address: store it on the device's TV link. A gone device is ignored. */
export function tvHostChanged(store: HostStore): (deviceId: string, host: string) => Promise<void> {
  return async (deviceId, host) => {
    const device = (await store.devices()).find((d) => d.id === deviceId);
    if (!device) return;
    await store.upsertDevice(withTvHost(device, host));
  };
}
