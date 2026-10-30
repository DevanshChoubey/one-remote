import type { Unsubscribe } from '@/core';
import { StoreError, type HomeSnapshot, type HomeStore } from './types';

const upsertById = <T extends { id: string }>(all: T[], item: T): T[] =>
  all.some((x) => x.id === item.id)
    ? all.map((x) => (x.id === item.id ? item : x))
    : [...all, item];

/** Pure state transitions shared by the memory and AsyncStorage stores. */
export const homeOps = {
  upsertDevice: (s: HomeSnapshot, d: HomeSnapshot['devices'][number]): HomeSnapshot => ({
    ...s,
    devices: upsertById(s.devices, d),
  }),
  removeDevice: (s: HomeSnapshot, id: string): HomeSnapshot => ({
    ...s,
    devices: s.devices.filter((d) => d.id !== id),
  }),
  upsertRoom: (s: HomeSnapshot, r: HomeSnapshot['rooms'][number]): HomeSnapshot => ({
    ...s,
    rooms: upsertById(s.rooms, r),
  }),
  removeRoom(s: HomeSnapshot, id: string): HomeSnapshot {
    if (s.devices.some((d) => d.roomId === id)) throw new StoreError('roomNotEmpty');
    return { ...s, rooms: s.rooms.filter((r) => r.id !== id) };
  },
  moveDevice(s: HomeSnapshot, id: string, toIndex: number): HomeSnapshot {
    const moving = s.devices.find((d) => d.id === id);
    if (!moving) throw new StoreError('notFound');
    const siblings = s.devices
      .filter((d) => d.roomId === moving.roomId && d.id !== id)
      .sort((a, b) => a.order - b.order);
    const at = Math.max(0, Math.min(siblings.length, Math.trunc(toIndex)));
    siblings.splice(at, 0, moving);
    const orderOf = new Map(siblings.map((d, i) => [d.id, i]));
    return {
      ...s,
      devices: s.devices.map((d) => {
        const order = orderOf.get(d.id);
        return order === undefined ? d : { ...d, order };
      }),
    };
  },
};

/** Calls every subscriber; a faulty one must not fail the write or starve the others. */
export function notifyAll(subs: Set<() => void>): void {
  for (const cb of [...subs]) {
    try {
      cb();
    } catch {
      // Ignored on purpose.
    }
  }
}

export function subscribeTo(subs: Set<() => void>, cb: () => void): Unsubscribe {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function createMemoryStore(): HomeStore {
  let snap: HomeSnapshot = { devices: [], rooms: [] };
  const subs = new Set<() => void>();
  const apply = async (change: (s: HomeSnapshot) => HomeSnapshot): Promise<void> => {
    snap = structuredClone(change(snap));
    notifyAll(subs);
  };
  return {
    devices: async () => structuredClone(snap.devices),
    rooms: async () => structuredClone(snap.rooms),
    upsertDevice: (d) => apply((s) => homeOps.upsertDevice(s, d)),
    removeDevice: (id) => apply((s) => homeOps.removeDevice(s, id)),
    upsertRoom: (r) => apply((s) => homeOps.upsertRoom(s, r)),
    removeRoom: (id) => apply((s) => homeOps.removeRoom(s, id)),
    moveDevice: (id, i) => apply((s) => homeOps.moveDevice(s, id, i)),
    subscribe: (cb) => subscribeTo(subs, cb),
  };
}
