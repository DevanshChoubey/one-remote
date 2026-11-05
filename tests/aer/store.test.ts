import { AER_CACHE_KEY, createAerStore } from '@/aer/store';
import type { SavedDispenser } from '@/aer/types';
import type { Device } from '@/core';
import { createMemoryStore } from '@/store/memoryStore';
import type { AsyncStorageLike, HomeStore } from '@/store/types';

const status: NonNullable<SavedDispenser['lastStatus']> = {
  batteryMv: 3000,
  firmware: '1.0',
  autoSpray: null,
  scheduleRunning: false,
  spraysSinceRefill: 3,
  at: '2026-10-26T10:00:00.000Z',
};

const aerDevice = (id = 'd1', over: Partial<Device> = {}): Device => ({
  id,
  kind: 'aer',
  name: 'Hall',
  roomId: 'r1',
  order: 0,
  links: [{ kind: 'aer', bleId: `ble-${id}`, timeZone: 'Asia/Kolkata' }],
  ...over,
});

const memStorage = (): AsyncStorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
};

const rig = async (): Promise<{
  home: HomeStore;
  storage: ReturnType<typeof memStorage>;
  store: ReturnType<typeof createAerStore>;
}> => {
  const home = createMemoryStore();
  await home.upsertRoom({ id: 'r1', name: 'Living', order: 0 });
  const storage = memStorage();
  const store = createAerStore({ home, storage });
  await store.load();
  return { home, storage, store };
};

describe('aer store', () => {
  it('builds a SavedDispenser from the device, its link and the cache', async () => {
    const { home, storage, store } = await rig();
    await home.upsertDevice(aerDevice());
    storage.data.set(AER_CACHE_KEY, JSON.stringify({ d1: { clockSet: true, status } }));
    const again = createAerStore({ home, storage });
    await again.load();
    expect(await again.get('d1')).toEqual({
      id: 'd1',
      bleId: 'ble-d1',
      name: 'Hall',
      homeTimeZone: 'Asia/Kolkata',
      clockSet: true,
      lastStatus: status,
    });
    expect(await store.get('nope')).toBeNull();
  });

  it('keeps reads, writes the cache, and leaves the home store alone when nothing in it changed', async () => {
    const { home, storage, store } = await rig();
    await home.upsertDevice(aerDevice());
    const homeSpy = jest.fn();
    home.subscribe(homeSpy);
    const cur = await store.get('d1');
    if (!cur) throw new Error('missing');
    const seen = jest.fn();
    store.subscribe(seen);
    await store.upsert({ ...cur, clockSet: true, lastStatus: status });
    expect(homeSpy).not.toHaveBeenCalled();
    expect(seen).toHaveBeenCalled();
    expect(JSON.parse(storage.data.get(AER_CACHE_KEY) ?? '{}')).toEqual({
      d1: { clockSet: true, status },
    });
    expect(store.view('d1')).toEqual({ deviceId: 'd1', clockSet: true, status });
  });

  it('view returns the same object until the reading changes, and watch fires on change', async () => {
    const { home, store } = await rig();
    await home.upsertDevice(aerDevice());
    const cur = await store.get('d1');
    if (!cur) throw new Error('missing');
    const cb = jest.fn();
    store.watch('d1', cb);
    await store.upsert({ ...cur, clockSet: true });
    const a = store.view('d1');
    expect(store.view('d1')).toBe(a);
    await store.upsert({ ...cur, clockSet: true });
    expect(store.view('d1')).toBe(a);
    expect(cb).toHaveBeenCalledTimes(1);
    await store.upsert({ ...cur, clockSet: false });
    expect(store.view('d1')).not.toBe(a);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('writes a renamed dispenser and a new zone back to the device', async () => {
    const { home, store } = await rig();
    await home.upsertDevice(aerDevice());
    const cur = await store.get('d1');
    if (!cur) throw new Error('missing');
    const channels = { reply: 'a', command: 'b', schedule: 'c' };
    await store.upsert({ ...cur, name: 'Bedroom', homeTimeZone: 'Europe/London', channels });
    const [d] = await home.devices();
    expect(d?.name).toBe('Bedroom');
    expect(d?.links).toEqual([
      { kind: 'aer', bleId: 'ble-d1', timeZone: 'Europe/London', channels },
    ]);
  });

  it('creates a staged device on its first upsert, and nothing for an unknown id', async () => {
    const { home, store } = await rig();
    const d = aerDevice('n1');
    store.stage(d);
    expect(await store.get('n1')).toBeNull();
    await store.upsert({ id: 'n1', bleId: 'ble-n1', name: 'Kitchen', homeTimeZone: 'UTC' });
    const devs = await home.devices();
    expect(devs).toHaveLength(1);
    expect(devs[0]?.name).toBe('Kitchen');
    expect(devs[0]?.links).toEqual([{ kind: 'aer', bleId: 'ble-n1', timeZone: 'UTC' }]);
    await store.upsert({ id: 'ghost', bleId: 'x', name: 'G', homeTimeZone: 'UTC', clockSet: true });
    expect(await home.devices()).toHaveLength(1);
    expect(store.view('ghost')).toEqual({ deviceId: 'ghost' });
  });

  it('a failed add leaves nothing behind and the device staged', async () => {
    const { home, storage, store } = await rig();
    store.stage(aerDevice('n1', { roomId: 'missing' }));
    const d: SavedDispenser = {
      id: 'n1',
      bleId: 'ble-n1',
      name: 'K',
      homeTimeZone: 'UTC',
      clockSet: true,
    };
    await expect(store.upsert(d)).rejects.toThrow();
    expect(await home.devices()).toHaveLength(0);
    expect(storage.data.has(AER_CACHE_KEY)).toBe(false);
    expect(store.view('n1')).toEqual({ deviceId: 'n1' });
    await home.upsertRoom({ id: 'missing', name: 'M', order: 1 });
    await store.upsert(d);
    expect(await home.devices()).toHaveLength(1);
  });

  it('drops cache entries whose status or schedules are not the expected shape', async () => {
    const home = createMemoryStore();
    const storage = memStorage();
    const goodSchedules = {
      list: [{ start: { h: 8, m: 0 }, end: { h: 9, m: 0 }, days: ['mon'], interval: 20 }],
      at: status.at,
    };
    storage.data.set(
      AER_CACHE_KEY,
      JSON.stringify({
        good: { clockSet: true, status, schedules: goodSchedules },
        noList: { status, schedules: { at: status.at } },
        badItem: { schedules: { list: [{ start: 8 }], at: status.at } },
        badStatus: { status: { ...status, batteryMv: 'full' } },
        statusArray: { status: [] },
        badClock: { clockSet: 'yes' },
      }),
    );
    const store = createAerStore({ home, storage });
    await store.load();
    expect(store.view('good')).toEqual({
      deviceId: 'good',
      clockSet: true,
      status,
      schedules: goodSchedules,
    });
    for (const id of ['noList', 'badItem', 'badStatus', 'statusArray', 'badClock']) {
      expect(store.view(id)).toEqual({ deviceId: id });
    }
  });

  it('corrupt cache reads as empty', async () => {
    const home = createMemoryStore();
    await home.upsertRoom({ id: 'r1', name: 'Living', order: 0 });
    await home.upsertDevice(aerDevice());
    const storage = memStorage();
    storage.data.set(AER_CACHE_KEY, '{oops');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createAerStore({ home, storage });
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.view('d1')).toEqual({ deviceId: 'd1' });
    expect(warn).toHaveBeenCalledTimes(1);
    const cur = await store.get('d1');
    if (!cur) throw new Error('missing');
    await store.upsert({ ...cur, clockSet: true });
    expect(() => JSON.parse(storage.data.get(AER_CACHE_KEY) ?? '')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a failing getItem reads as empty', async () => {
    const home = createMemoryStore();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createAerStore({
      home,
      storage: {
        getItem: async () => {
          throw new Error('io');
        },
        setItem: async () => undefined,
      },
    });
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.view('d1')).toEqual({ deviceId: 'd1' });
    warn.mockRestore();
  });

  it('lists only aer devices', async () => {
    const { home, store } = await rig();
    await home.upsertDevice(aerDevice('a1'));
    await home.upsertDevice({
      id: 'tv1',
      kind: 'tv',
      name: 'TV',
      roomId: 'r1',
      order: 1,
      links: [{ kind: 'matter', nodeId: '1' }],
    });
    expect((await store.list()).map((d) => d.id)).toEqual(['a1']);
    expect(await store.get('tv1')).toBeNull();
  });

  it('bleIds lists every added dispenser', async () => {
    const { home, store } = await rig();
    await home.upsertDevice(aerDevice('a1'));
    await home.upsertDevice(aerDevice('a2', { order: 1 }));
    expect(await store.bleIds()).toEqual(new Set(['ble-a1', 'ble-a2']));
  });

  // The alert engine may ask for notifications only after a reading, never after another write.
  it('tells subscribers whether a change is a new reading', async () => {
    const { home, store } = await rig();
    await home.upsertDevice(aerDevice());
    const seen = jest.fn();
    store.subscribe(seen);
    await home.upsertDevice({
      id: 'tv',
      kind: 'tv',
      name: 'TV',
      roomId: 'r1',
      order: 1,
      links: [],
    } as unknown as Device);
    expect(seen).toHaveBeenCalled();
    expect(seen.mock.calls.every(([c]) => c?.reading === false)).toBe(true);

    seen.mockClear();
    const cur = await store.get('d1');
    if (!cur) throw new Error('missing');
    await store.upsert({ ...cur, clockSet: true, lastStatus: status });
    expect(seen).toHaveBeenLastCalledWith({ reading: true });

    seen.mockClear();
    const read = await store.get('d1');
    if (!read) throw new Error('missing');
    await store.upsert({ ...read, name: 'Bedroom' });
    expect(seen).toHaveBeenCalled();
    expect(seen.mock.calls.every(([c]) => c?.reading === false)).toBe(true);

    seen.mockClear();
    await store.remove('d1');
    expect(seen).toHaveBeenCalled();
    expect(seen.mock.calls.every(([c]) => c?.reading === false)).toBe(true);
  });

  it('remove drops the device and its cached reading', async () => {
    const { home, storage, store } = await rig();
    await home.upsertDevice(aerDevice());
    const cur = await store.get('d1');
    if (!cur) throw new Error('missing');
    await store.upsert({ ...cur, clockSet: true, lastStatus: status });
    const seen = jest.fn();
    store.subscribe(seen);
    await store.remove('d1');
    expect(await home.devices()).toHaveLength(0);
    expect(JSON.parse(storage.data.get(AER_CACHE_KEY) ?? '{}')).not.toHaveProperty('d1');
    expect(seen).toHaveBeenCalled();
    const fresh = createAerStore({ home, storage });
    await fresh.load();
    expect(fresh.view('d1')).toEqual({ deviceId: 'd1' });
  });
});
