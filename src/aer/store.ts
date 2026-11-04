// The aer store: the dispenser client's DispenserStore, kept on One Remote's home store. Name, zone and
// channels live on the home device's aer link; what was read from the dispenser lives in a cache.
import type { AerChannels, Device, Link, Unsubscribe } from '@/core';
import type { AsyncStorageLike, HomeStore } from '@/store/types';
import type { AerView, DispenserStore, DispenserStoreChange, SavedDispenser } from './types';

export const AER_CACHE_KEY = 'one-remote/aer/v1'; // JSON Record<deviceId, Omit<AerView, 'deviceId'>>

type CacheEntry = Omit<AerView, 'deviceId'>;
type AerLink = Extract<Link, { kind: 'aer' }>;

export interface AerStore extends DispenserStore {
  /** Reads the cache once; corrupt or missing reads as empty. */
  load(): Promise<void>;
  /** Synchronous after load. The same object until the reading changes. */
  view(deviceId: string): AerView;
  watch(deviceId: string, cb: (v: AerView) => void): Unsubscribe;
  /** add(): the next upsert() of this id creates the home device. */
  stage(device: Device): void;
  unstage(deviceId: string): void;
  dropCache(deviceId: string): Promise<void>;
  /** Bluetooth ids of the aer links already in the home store. */
  bleIds(): Promise<Set<string>>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const aerLink = (d: Device): AerLink | undefined =>
  d.links.find((l): l is AerLink => l.kind === 'aer');

const sameChannels = (a?: AerChannels, b?: AerChannels): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const toEntry = (d: SavedDispenser): CacheEntry => {
  const e: CacheEntry = {};
  if (d.clockSet !== undefined) e.clockSet = d.clockSet;
  if (d.lastStatus) e.status = d.lastStatus;
  if (d.schedules) e.schedules = d.schedules;
  return e;
};

const toViewOf = (id: string, e: CacheEntry | undefined): AerView => ({ deviceId: id, ...e });

export function createAerStore(deps: { home: HomeStore; storage: AsyncStorageLike }): AerStore {
  const { home, storage } = deps;
  const subs = new Set<(change: DispenserStoreChange) => void>();
  const watchers = new Map<string, Set<(v: AerView) => void>>();
  const views = new Map<string, AerView>();
  const staged = new Map<string, Device>();
  let cache: Record<string, CacheEntry> = {};
  let loaded: Promise<void> | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  const notify = (change: DispenserStoreChange): void => {
    for (const cb of [...subs]) {
      try {
        cb(change);
      } catch {
        // A faulty subscriber must not fail the write or starve the others.
      }
    }
  };

  const read = async (): Promise<Record<string, CacheEntry>> => {
    let raw: string | null;
    try {
      raw = await storage.getItem(AER_CACHE_KEY);
    } catch {
      console.warn('one-remote: the aer cache could not be read; starting empty');
      return {};
    }
    if (raw === null) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    if (!isRecord(parsed)) {
      console.warn('one-remote: the aer cache is corrupt; starting empty');
      return {};
    }
    const out: Record<string, CacheEntry> = {};
    for (const [id, e] of Object.entries(parsed)) if (isRecord(e)) out[id] = e as CacheEntry;
    return out;
  };

  const ensureLoaded = (): Promise<void> => {
    loaded ??= read().then((c) => {
      cache = c;
    });
    return loaded;
  };

  /** Replaces a device's view object only when its reading changed, then tells its watchers. */
  const refreshView = (id: string): void => {
    const next = toViewOf(id, cache[id]);
    const prev = views.get(id);
    if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
    views.set(id, next);
    for (const cb of [...(watchers.get(id) ?? [])]) {
      try {
        cb(next);
      } catch {
        // Ignored on purpose.
      }
    }
  };

  /** Whether an entry carries a status or schedule list that the previous one did not. */
  const newReading = (prev: CacheEntry | undefined, next: CacheEntry | undefined): boolean =>
    next !== undefined &&
    (next.status !== undefined || next.schedules !== undefined) &&
    JSON.stringify([prev?.status, prev?.schedules]) !==
      JSON.stringify([next.status, next.schedules]);

  /** Cache writes read-modify-write one key, so they run one at a time. */
  const mutate = (
    change: (c: Record<string, CacheEntry>) => Record<string, CacheEntry>,
  ): Promise<void> => {
    const run = tail.then(async () => {
      await ensureLoaded();
      const next = change({ ...cache });
      await storage.setItem(AER_CACHE_KEY, JSON.stringify(next));
      const ids = new Set([...Object.keys(cache), ...Object.keys(next)]);
      const reading = [...ids].some((id) => newReading(cache[id], next[id]));
      cache = next;
      for (const id of ids) refreshView(id);
      return reading;
    });
    tail = run.catch(() => undefined);
    return run.then((reading) => notify({ reading }));
  };

  const saved = (d: Device): SavedDispenser | null => {
    const link = d.kind === 'aer' ? aerLink(d) : undefined;
    if (!link) return null;
    const e = cache[d.id];
    return {
      id: d.id,
      bleId: link.bleId,
      name: d.name,
      homeTimeZone: link.timeZone,
      ...(link.channels ? { channels: link.channels } : {}),
      ...(e?.clockSet !== undefined ? { clockSet: e.clockSet } : {}),
      ...(e?.status ? { lastStatus: e.status } : {}),
      ...(e?.schedules ? { schedules: e.schedules } : {}),
    };
  };

  const merged = (d: Device, s: SavedDispenser): Device => {
    const link: AerLink = {
      kind: 'aer',
      bleId: s.bleId,
      timeZone: s.homeTimeZone,
      ...(s.channels ? { channels: s.channels } : {}),
    };
    const rest = d.links.filter((l) => l.kind !== 'aer');
    return { ...d, name: s.name, links: [...rest, link] };
  };

  const dropCache = (id: string): Promise<void> =>
    mutate((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== id)));

  // A home write (a rename, another device, a host change) is never a reading.
  home.subscribe(() => notify({ reading: false }));

  return {
    async load() {
      await ensureLoaded();
      for (const id of Object.keys(cache)) refreshView(id);
    },
    view(id) {
      let v = views.get(id);
      if (!v) {
        v = toViewOf(id, cache[id]);
        views.set(id, v);
      }
      return v;
    },
    watch(id, cb) {
      let set = watchers.get(id);
      if (!set) {
        set = new Set();
        watchers.set(id, set);
      }
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
    stage(device) {
      staged.set(device.id, device);
    },
    unstage(id) {
      staged.delete(id);
    },
    dropCache,
    async bleIds() {
      const ids = new Set<string>();
      for (const d of await home.devices()) {
        const link = d.kind === 'aer' ? aerLink(d) : undefined;
        if (link) ids.add(link.bleId);
      }
      return ids;
    },
    async list() {
      await ensureLoaded();
      return (await home.devices()).flatMap((d) => saved(d) ?? []);
    },
    async get(id) {
      await ensureLoaded();
      const d = (await home.devices()).find((x) => x.id === id);
      return d ? saved(d) : null;
    },
    async upsert(s) {
      const stagedDevice = staged.get(s.id);
      if (stagedDevice) {
        // The home write comes first: if it throws, nothing is cached and the device stays staged.
        await home.upsertDevice(merged(stagedDevice, s));
        staged.delete(s.id);
      } else {
        const d = (await home.devices()).find((x) => x.id === s.id && x.kind === 'aer');
        if (!d) return;
        const link = aerLink(d);
        if (
          d.name !== s.name ||
          link?.timeZone !== s.homeTimeZone ||
          !sameChannels(link.channels, s.channels)
        ) {
          await home.upsertDevice(merged(d, s));
        }
      }
      await mutate((c) => ({ ...c, [s.id]: toEntry(s) }));
    },
    async remove(id) {
      await home.removeDevice(id);
      staged.delete(id);
      await dropCache(id);
    },
    subscribe(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
  };
}
