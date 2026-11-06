import type { Device, Room } from '@/core';
import { homeOps, notifyAll, subscribeTo } from './memoryStore';
import { StoreError, type AsyncStorageLike, type HomeSnapshot, type HomeStore } from './types';

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

function corrupt(): StoreError {
  return new StoreError('corrupt', 'Stored home data is corrupt');
}

export function createAsyncStorageStore(storage: AsyncStorageLike): HomeStore {
  const subs = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();
  let warned = false;

  /**
   * Rejects with StoreError('corrupt') rather than reading damaged data as empty: an empty read would
   * let the next write overwrite every device. Writes read first, so they are refused too.
   */
  const read = async (): Promise<HomeSnapshot> => {
    const raw = await storage.getItem(KEY);
    if (raw === null) return { devices: [], rooms: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (
      isRecord(parsed) &&
      Array.isArray(parsed.devices) &&
      Array.isArray(parsed.rooms) &&
      parsed.devices.every(isDevice) &&
      parsed.rooms.every(isRoom)
    ) {
      return { devices: parsed.devices, rooms: parsed.rooms };
    }
    if (!warned) {
      warned = true;
      console.error('one-remote: stored home data is corrupt; reads and writes are refused');
    }
    throw corrupt();
  };

  /** Writes read-modify-write one key, so they run one at a time. */
  const mutate = (change: (s: HomeSnapshot) => HomeSnapshot): Promise<void> => {
    const run = tail.then(async () => {
      await storage.setItem(KEY, JSON.stringify(change(await read())));
    });
    tail = run.catch(() => undefined);
    return run.then(() => notifyAll(subs));
  };

  /** Like mutate, but `change` may decline (null): then nothing is written and no one is told. */
  const update = (id: string, change: (d: Device) => Device | null): Promise<Device | null> => {
    const run = tail.then(async () => {
      const out = homeOps.updateDevice(await read(), id, change);
      if (out) await storage.setItem(KEY, JSON.stringify(out.snap));
      return out?.saved ?? null;
    });
    tail = run.catch(() => undefined);
    return run.then((saved) => {
      if (saved) notifyAll(subs);
      return saved;
    });
  };

  const snapshot = async (): Promise<HomeSnapshot> => {
    await tail;
    return read();
  };

  return {
    devices: async () => (await snapshot()).devices,
    rooms: async () => (await snapshot()).rooms,
    upsertDevice: (d) => mutate((s) => homeOps.upsertDevice(s, d)),
    updateDevice: update,
    removeDevice: (id) => mutate((s) => homeOps.removeDevice(s, id)),
    upsertRoom: (r) => mutate((s) => homeOps.upsertRoom(s, r)),
    removeRoom: (id) => mutate((s) => homeOps.removeRoom(s, id)),
    moveDevice: (id, i) => mutate((s) => homeOps.moveDevice(s, id, i)),
    moveRoom: (id, i) => mutate((s) => homeOps.moveRoom(s, id, i)),
    subscribe: (cb) => subscribeTo(subs, cb),
  };
}
