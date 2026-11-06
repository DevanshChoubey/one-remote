import type { Device, Room } from '@/core';
import { createAsyncStorageStore } from '@/store/asyncStorageStore';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemorySecretStore, createSecureSecretStore, secureKey } from '@/store/secrets';
import { StoreError, type AsyncStorageLike, type HomeStore } from '@/store/types';

const KEY = 'one-remote/home/v1';

function memStorage(initial: Record<string, string> = {}): AsyncStorageLike {
  const m = new Map(Object.entries(initial));
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => {
      m.set(k, v);
    },
  };
}

const dev = (id: string, roomId: string, order: number): Device => ({
  id,
  kind: 'tv',
  name: id,
  roomId,
  order,
  links: [{ kind: 'ir', remoteId: 'x/y' }],
});
const room = (id: string, order = 0): Room => ({ id, name: id, order });

const impls: [string, () => HomeStore][] = [
  ['memory', () => createMemoryStore()],
  ['asyncStorage', () => createAsyncStorageStore(memStorage())],
];

describe.each(impls)('HomeStore (%s)', (_name, make) => {
  it('rejects a device whose room does not exist', async () => {
    const s = make();
    await expect(s.upsertDevice(dev('a', 'nope', 0))).rejects.toMatchObject({ code: 'notFound' });
    await expect(s.upsertDevice(dev('a', 'nope', 0))).rejects.toBeInstanceOf(StoreError);
    expect(await s.devices()).toEqual([]);
  });

  it('round-trips a device and upserts by id', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    expect(await s.devices()).toEqual([dev('a', 'r1', 0)]);
    await s.upsertDevice({ ...dev('a', 'r1', 0), name: 'renamed' });
    expect((await s.devices()).map((d) => d.name)).toEqual(['renamed']);
  });

  it('removes a device', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    await s.removeDevice('a');
    expect(await s.devices()).toEqual([]);
  });

  it('round-trips and upserts rooms', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertRoom({ ...room('r1'), name: 'Lounge' });
    expect(await s.rooms()).toEqual([{ id: 'r1', name: 'Lounge', order: 0 }]);
  });

  it('rejects removing a room that has a device, allows an empty one', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    await expect(s.removeRoom('r1')).rejects.toMatchObject({ code: 'roomNotEmpty' });
    await expect(s.removeRoom('r1')).rejects.toBeInstanceOf(StoreError);
    await s.removeDevice('a');
    await s.removeRoom('r1');
    expect(await s.rooms()).toEqual([]);
  });

  it('moveDevice makes it first in its room and renumbers order', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertRoom(room('r2'));
    await s.upsertDevice(dev('a', 'r1', 0));
    await s.upsertDevice(dev('b', 'r1', 1));
    await s.upsertDevice(dev('c', 'r1', 2));
    await s.upsertDevice(dev('z', 'r2', 0));
    await s.moveDevice('c', 0);
    const inRoom = (await s.devices())
      .filter((d) => d.roomId === 'r1')
      .sort((x, y) => x.order - y.order);
    expect(inRoom.map((d) => [d.id, d.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect((await s.devices()).find((d) => d.id === 'z')?.order).toBe(0);
  });

  it('moveRoom reorders rooms atomically and renumbers order', async () => {
    const s = make();
    await s.upsertRoom(room('a', 0));
    await s.upsertRoom(room('b', 1));
    await s.upsertRoom(room('c', 2));
    await s.moveRoom('c', 0);
    const rooms = (await s.rooms()).sort((x, y) => x.order - y.order);
    expect(rooms.map((r) => [r.id, r.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    await s.moveRoom('c', 99);
    expect((await s.rooms()).find((r) => r.id === 'c')?.order).toBe(2);
    await expect(s.moveRoom('nope', 0)).rejects.toMatchObject({ code: 'notFound' });
  });

  it('moveDevice clamps the index and rejects unknown ids', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    await s.upsertDevice(dev('b', 'r1', 1));
    await s.moveDevice('a', 99);
    expect((await s.devices()).find((d) => d.id === 'a')?.order).toBe(1);
    await expect(s.moveDevice('nope', 0)).rejects.toMatchObject({ code: 'notFound' });
  });

  it('notifies subscribers after each write until unsubscribed', async () => {
    const s = make();
    const cb = jest.fn();
    const off = s.subscribe(cb);
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    await s.moveDevice('a', 0);
    await s.removeDevice('a');
    await s.removeRoom('r1');
    expect(cb).toHaveBeenCalledTimes(5);
    off();
    await s.upsertRoom(room('r2'));
    expect(cb).toHaveBeenCalledTimes(5);
  });

  it('a throwing subscriber does not fail the write', async () => {
    const s = make();
    const ok = jest.fn();
    s.subscribe(() => {
      throw new Error('boom');
    });
    s.subscribe(ok);
    await s.upsertRoom(room('r1'));
    expect(ok).toHaveBeenCalled();
  });

  it('updateDevice: two overlapping updates both survive', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    await Promise.all([
      s.updateDevice('a', (d) => ({ ...d, name: 'Renamed' })),
      s.updateDevice('a', (d) => ({ ...d, links: [{ kind: 'ir', remoteId: 'new/one' }] })),
    ]);
    expect((await s.devices())[0]).toMatchObject({
      name: 'Renamed',
      links: [{ kind: 'ir', remoteId: 'new/one' }],
    });
  });

  it('updateDevice skips an unknown id or a null change, and keeps the room check', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    const cb = jest.fn();
    s.subscribe(cb);
    expect(await s.updateDevice('gone', (d) => d)).toBeNull();
    expect(await s.updateDevice('a', () => null)).toBeNull();
    expect(cb).not.toHaveBeenCalled();
    await expect(s.updateDevice('a', (d) => ({ ...d, roomId: 'nope' }))).rejects.toMatchObject({
      code: 'notFound',
    });
    const saved = await s.updateDevice('a', (d) => ({ ...d, id: 'other', name: 'b' }));
    expect(saved).toMatchObject({ id: 'a', name: 'b' });
    expect(await s.devices()).toEqual([{ ...dev('a', 'r1', 0), name: 'b' }]);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not alias returned data', async () => {
    const s = make();
    await s.upsertRoom(room('r1'));
    await s.upsertDevice(dev('a', 'r1', 0));
    const first = (await s.devices())[0];
    if (first) first.name = 'mutated';
    expect((await s.devices())[0]?.name).toBe('a');
  });
});

describe('asyncStorage corruption', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const seededKey = (): string =>
    JSON.stringify({ devices: [dev('a', 'r1', 0)], rooms: [room('r1')] });

  it.each([
    ['bad JSON', '{not json'],
    ['a non-object', '[]'],
    ['a missing devices list', JSON.stringify({ rooms: [] })],
    ['a rooms field that is not a list', JSON.stringify({ devices: [], rooms: 'x' })],
    ['an invalid device', JSON.stringify({ devices: [{ id: 1 }], rooms: [] })],
    ['an invalid room', JSON.stringify({ devices: [], rooms: [{ id: 'r' }] })],
  ])('rejects reads of corrupt data (%s) instead of reading it as empty', async (_what, raw) => {
    const s = createAsyncStorageStore(memStorage({ [KEY]: raw }));
    await expect(s.devices()).rejects.toMatchObject({ code: 'corrupt' });
    await expect(s.rooms()).rejects.toBeInstanceOf(StoreError);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('refuses every write while the data is corrupt and never overwrites it', async () => {
    const storage = memStorage({ [KEY]: '{not json' });
    const setItem = jest.spyOn(storage, 'setItem');
    const s = createAsyncStorageStore(storage);
    await expect(s.upsertRoom(room('r1'))).rejects.toMatchObject({ code: 'corrupt' });
    await expect(s.removeDevice('a')).rejects.toMatchObject({ code: 'corrupt' });
    await expect(s.moveRoom('r1', 0)).rejects.toMatchObject({ code: 'corrupt' });
    expect(setItem).not.toHaveBeenCalled();
    expect(await storage.getItem(KEY)).toBe('{not json');
  });

  it('reads and writes again once the data is valid', async () => {
    const storage = memStorage({ [KEY]: '{not json' });
    const s = createAsyncStorageStore(storage);
    await expect(s.devices()).rejects.toMatchObject({ code: 'corrupt' });
    await storage.setItem(KEY, seededKey());
    expect(await s.devices()).toEqual([dev('a', 'r1', 0)]);
    await s.upsertRoom(room('r2', 1));
    expect(await s.rooms()).toHaveLength(2);
  });

  it('reads an empty home when nothing is stored', async () => {
    const s = createAsyncStorageStore(memStorage());
    expect(await s.devices()).toEqual([]);
    expect(await s.rooms()).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('serialises concurrent writes', async () => {
    const s = createAsyncStorageStore(memStorage());
    await s.upsertRoom(room('r'));
    await Promise.all([s.upsertDevice(dev('a', 'r', 0)), s.upsertDevice(dev('b', 'r', 1))]);
    expect((await s.devices()).length).toBe(2);
  });

  it('a failed write rejects and does not block later writes', async () => {
    let fail = true;
    const base = memStorage();
    const s = createAsyncStorageStore({
      getItem: base.getItem,
      setItem: async (k, v) => {
        if (fail) throw new Error('disk full');
        await base.setItem(k, v);
      },
    });
    await expect(s.upsertRoom(room('r1'))).rejects.toThrow('disk full');
    fail = false;
    await s.upsertRoom(room('r1'));
    expect(await s.rooms()).toHaveLength(1);
  });
});

describe('StoreError', () => {
  it('has a code, name and working instanceof', () => {
    const e = new StoreError('notFound');
    expect(e).toBeInstanceOf(StoreError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('notFound');
    expect(e.name).toBe('StoreError');
  });
});

describe('createMemorySecretStore', () => {
  it('gets, sets, overwrites and deletes', async () => {
    const s = createMemorySecretStore();
    expect(await s.get('a')).toBeNull();
    await s.set('a', '1');
    await s.set('a', '2');
    expect(await s.get('a')).toBe('2');
    await s.delete('a');
    expect(await s.get('a')).toBeNull();
  });
});

describe('createSecureSecretStore', () => {
  const mockSecure = jest.requireMock<{
    getItemAsync: jest.Mock;
    setItemAsync: jest.Mock;
    deleteItemAsync: jest.Mock;
  }>('expo-secure-store');

  it('maps refs to SecureStore-safe keys', () => {
    expect(secureKey('webos/192.168.1.5:3001')).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(secureKey('a/b')).not.toBe(secureKey('a_b'));
    expect(secureKey('a/b')).not.toBe(secureKey('a:b'));
    expect(secureKey('plain-ref.1')).toBe(secureKey('plain-ref.1'));
    expect(secureKey('é')).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(secureKey('😀')).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('delegates to expo-secure-store with the mapped key', async () => {
    const s = createSecureSecretStore();
    const ref = 'webos/tv:1';
    mockSecure.getItemAsync.mockResolvedValueOnce('v');
    expect(await s.get(ref)).toBe('v');
    expect(mockSecure.getItemAsync).toHaveBeenCalledWith(secureKey(ref));
    await s.set(ref, 'x');
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith(secureKey(ref), 'x');
    await s.delete(ref);
    expect(mockSecure.deleteItemAsync).toHaveBeenCalledWith(secureKey(ref));
  });
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
