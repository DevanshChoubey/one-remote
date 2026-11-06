import { withTvHost, type Device } from '@/core';

/** The slice of the store that `tvHostChanged` needs. */
interface HostStore {
  updateDevice(id: string, change: (d: Device) => Device | null): Promise<Device | null>;
}

/**
 * The TV was found at a new address: store it on the device's TV link. A gone device is ignored.
 * The change runs inside the store's write queue, so an overlapping write (a new pairing key, a
 * rename) is never undone by a stale copy of the device.
 */
export function tvHostChanged(store: HostStore): (deviceId: string, host: string) => Promise<void> {
  return async (deviceId, host) => {
    await store.updateDevice(deviceId, (d) => {
      const next = withTvHost(d, host);
      return next === d ? null : next;
    });
  };
}
