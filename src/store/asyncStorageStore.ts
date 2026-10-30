import type { Device, Room } from '@/core';
import { homeOps, notifyAll, subscribeTo } from './memoryStore';
import type { AsyncStorageLike, HomeSnapshot, HomeStore } from './types';

const KEY = 'one-remote/home/v1';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isRoom = (v: unknown): v is Room =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.name === 'string' &&
  typeof v.order === 'number';

const isDevice = (v: unknown): v is Device =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.kind === 'string' &&
  typeof v.name === 'string' &&
  typeof v.roomId === 'string' &&
  typeof v.order === 'number' &&
  Array.isArray(v.links);

export function createAsyncStorageStore(storage: AsyncStorageLike): HomeStore {
  const subs = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();
  let warned = false;

  const read = async (): Promise<HomeSnapshot> => {
    const raw = await storage.getItem(KEY);
    if (raw === null) return { devices: [], rooms: [] };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return { devices: [], rooms: [] };
      return {
        devices: Array.isArray(parsed.devices) ? parsed.devices.filter(isDevice) : [],
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms.filter(isRoom) : [],
      };
    } catch {
      // Corrupt data: start over rather than lock the user out of the app.
      if (!warned) {
        warned = true;
        console.warn('one-remote: stored home data is corrupt; starting empty');
      }
      return { devices: [], rooms: [] };
    }
  };

  /** Writes read-modify-write one key, so they run one at a time. */
  const mutate = (change: (s: HomeSnapshot) => HomeSnapshot): Promise<void> => {
    const run = tail.then(async () => {
      await storage.setItem(KEY, JSON.stringify(change(await read())));
    });
    tail = run.catch(() => undefined);
    return run.then(() => notifyAll(subs));
  };

  const snapshot = async (): Promise<HomeSnapshot> => {
    await tail;
    return read();
  };

  return {
    devices: async () => (await snapshot()).devices,
    rooms: async () => (await snapshot()).rooms,
    upsertDevice: (d) => mutate((s) => homeOps.upsertDevice(s, d)),
    removeDevice: (id) => mutate((s) => homeOps.removeDevice(s, id)),
    upsertRoom: (r) => mutate((s) => homeOps.upsertRoom(s, r)),
    removeRoom: (id) => mutate((s) => homeOps.removeRoom(s, id)),
    moveDevice: (id, i) => mutate((s) => homeOps.moveDevice(s, id, i)),
    subscribe: (cb) => subscribeTo(subs, cb),
  };
}
