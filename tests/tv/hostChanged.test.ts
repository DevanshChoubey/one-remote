import type { Device } from '@/core';
import { createAsyncStorageStore } from '@/store/asyncStorageStore';
import { createMemoryStore } from '@/store/memoryStore';
import type { AsyncStorageLike, HomeStore } from '@/store/types';
import { tvHostChanged } from '@/tv/hostChanged';

const memStorage = (): AsyncStorageLike => {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => {
      m.set(k, v);
    },
  };
};

const tv: Device = {
  id: 'tv1',
  kind: 'tv',
  name: 'TV',
  roomId: 'r1',
  order: 0,
  links: [{ kind: 'webos', host: '10.0.0.1', mac: 'AA', secure: true, clientKeyRef: 'k1' }],
};

const impls: [string, () => HomeStore][] = [
  ['memory', () => createMemoryStore()],
  ['asyncStorage', () => createAsyncStorageStore(memStorage())],
];

describe.each(impls)('tvHostChanged (%s)', (_name, make) => {
  const rig = async (): Promise<HomeStore> => {
    const store = make();
    await store.upsertRoom({ id: 'r1', name: 'Room', order: 0 });
    await store.upsertDevice(tv);
    return store;
  };

  it('stores the new host on the TV link', async () => {
    const store = await rig();
    await tvHostChanged(store)('tv1', '10.0.0.9');
    expect((await store.devices())[0]?.links[0]).toMatchObject({ host: '10.0.0.9', mac: 'AA' });
  });

  it('ignores a gone device', async () => {
    const store = await rig();
    await tvHostChanged(store)('nope', '10.0.0.9');
    expect(await store.devices()).toEqual([tv]);
  });

  it('a host change and an overlapping rename both survive', async () => {
    const store = await rig();
    await Promise.all([
      tvHostChanged(store)('tv1', '10.0.0.9'),
      Promise.resolve().then(() => store.updateDevice('tv1', (d) => ({ ...d, name: 'Den' }))),
    ]);
    expect((await store.devices())[0]).toMatchObject({
      name: 'Den',
      links: [{ host: '10.0.0.9' }],
    });
  });
});
