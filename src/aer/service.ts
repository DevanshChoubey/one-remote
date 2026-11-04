// The AerService: the dispenser client, kept on One Remote's home store through the aer store.
import type { Device } from '@/core';
import type { AsyncStorageLike, HomeStore } from '@/store/types';
import type { BleTransport } from '@/transport/ble/transport';
import { DispenserClient, type ClientOptions } from './client';
import type { Interval, Schedule } from './protocol';
import { createAerStore, type AerStore } from './store';
import type { AerService, DispenserStore } from './types';

export interface AerDeps {
  transport: BleTransport;
  home: HomeStore;
  storage: AsyncStorageLike;
  /** false on Android below 12 (API 31). */
  supported: boolean;
  client?: ClientOptions;
  now?: () => Date;
}

/**
 * Builds the aer backend. The app must call this once: the aer store keeps the readings in memory,
 * and that copy is the source of truth, so a second instance would show stale data.
 * Call `start()` once at startup, before anything reads a view.
 */
export function createAer(deps: AerDeps): {
  service: AerService;
  dispenserStore: DispenserStore;
  aerStore: AerStore;
  start(): Promise<void>;
} {
  const aerStore = createAerStore({ home: deps.home, storage: deps.storage });
  const client = new DispenserClient(deps.transport, aerStore, {
    ...deps.client,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const service: AerService = {
    supported: () => deps.supported,
    view: (id) => aerStore.view(id),
    subscribe: (id, cb) => aerStore.watch(id, cb),
    scan(onFound, timeoutMs) {
      const reported = new Set<string>();
      let known: Set<string> | null = null;
      let chain: Promise<void> = aerStore.bleIds().then((ids) => {
        known = ids;
      });
      const inner = client.scan((d) => {
        // Found devices wait for the saved ids; order is kept.
        chain = chain.then(() => {
          if (known?.has(d.id) || reported.has(d.id)) return;
          reported.add(d.id);
          onFound({ bleId: d.id, name: d.name, rssi: d.rssi });
        });
      }, timeoutMs);
      return {
        stop: inner.stop,
        done: inner.done.then(() => chain),
      };
    },
    blink: (id, target) =>
      client.blink(id, target && { bleId: target.bleId, homeTimeZone: target.timeZone }),
    async add(device: Device) {
      const link = device.links.find((l) => l.kind === 'aer');
      if (device.kind !== 'aer' || link?.kind !== 'aer') {
        throw new Error('add needs an aer device with an aer link');
      }
      aerStore.stage(device);
      try {
        await client.add(device.id, device.name, link.timeZone, link.bleId);
      } finally {
        aerStore.unstage(device.id);
      }
    },
    async refresh(id) {
      await client.refresh(id);
      return aerStore.view(id);
    },
    sprayNow: (id) => client.sprayNow(id),
    setAutoSpray: (id, interval: Interval | null) => client.setAutoSpray(id, interval),
    resetRefill: (id) => client.resetRefill(id),
    saveSchedules: (id, list: Schedule[]) => client.saveSchedules(id, list),
    setTimeZone: (id, zone) => client.setHomeTimeZone(id, zone),
    async forget(id) {
      await client.remove(id);
      await aerStore.dropCache(id);
    },
    closeAll: () => client.closeAll(),
  };

  return {
    service,
    dispenserStore: aerStore,
    aerStore,
    async start() {
      await aerStore.load();
      // Wave 2 starts the alerts engine here, after the cache is loaded.
    },
  };
}
