import type { Device } from '@/core';
import { createGreeClient } from '@/gree/client';
import { greeLinkChanged } from '@/gree/linkChanged';
import { createGreeSetup } from '@/gree/setup';
import { FakeGreeUnit, createFakeGreeLan } from '@/gree/testing/fakeGree';
import { createMemoryStore } from '@/store/memoryStore';

describe('Gree setup', () => {
  it('scans and binds a unit into a link', async () => {
    const unit = new FakeGreeUnit({ mac: 'f4911e000009', host: '192.168.1.60', cipher: 'gcm' });
    const setup = createGreeSetup({ client: createGreeClient({ udp: createFakeGreeLan([unit]) }) });
    expect(setup.available()).toBe(true);
    const [found] = await setup.scan();
    expect(found).toMatchObject({ mac: 'f4911e000009', host: '192.168.1.60', cipher: 'gcm' });
    await expect(setup.bind(found as NonNullable<typeof found>)).resolves.toEqual({
      kind: 'gree',
      mac: 'f4911e000009',
      host: '192.168.1.60',
      key: unit.key,
      cipher: 'gcm',
    });
    expect(
      createGreeSetup({
        client: createGreeClient({ udp: createFakeGreeLan([]) }),
        enabled: false,
      }).available(),
    ).toBe(false);
  });
});

describe('greeLinkChanged', () => {
  it('replaces the link with the same MAC and leaves the rest', async () => {
    const store = createMemoryStore();
    const old = {
      kind: 'gree' as const,
      mac: 'aa',
      host: '192.168.1.2',
      key: 'k',
      cipher: 'ecb' as const,
    };
    const d: Device = {
      id: 'd1',
      kind: 'ac',
      name: 'AC',
      roomId: 'r',
      order: 0,
      links: [old, { kind: 'ir', remoteId: 'x' }],
    };
    await store.upsertRoom({ id: 'r', name: 'Room', order: 0 });
    await store.upsertDevice(d);
    const save = greeLinkChanged(store);
    await save('d1', { ...old, host: '192.168.1.9' });
    await save('gone', { ...old, host: '192.168.1.10' });
    await save('d1', { ...old, mac: 'bb' });
    expect((await store.devices())[0]?.links).toEqual([
      { ...old, host: '192.168.1.9' },
      { kind: 'ir', remoteId: 'x' },
    ]);
  });
});
