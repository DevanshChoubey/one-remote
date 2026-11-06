import type { Device } from '@/core';
import type { GreeLink } from './driver';

/** The slice of the store that `greeLinkChanged` needs. */
interface LinkStore {
  devices(): Promise<Device[]>;
  upsertDevice(device: Device): Promise<void>;
}

/** A Gree unit moved or was reset: store the new link in place of the one with its MAC. */
export function greeLinkChanged(
  store: LinkStore,
): (deviceId: string, link: GreeLink) => Promise<void> {
  return async (deviceId, link) => {
    const device = (await store.devices()).find((d) => d.id === deviceId);
    if (!device) return;
    let changed = false;
    const links = device.links.map((l) => {
      if (l.kind !== 'gree' || l.mac !== link.mac) return l;
      changed = true;
      return link;
    });
    if (changed) await store.upsertDevice({ ...device, links });
  };
}
