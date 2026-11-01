import type { Device, PairedTv } from '@/core';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { createServices } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { fakeTvSetup } from '../screens/fakeTvSetup';

jest.mock('react-native-udp');
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const link = {
  kind: 'webos' as const,
  host: '192.168.1.23',
  mac: 'AA',
  secure: true,
  clientKeyRef: 'key-1',
};
const tvDevice: Device = {
  id: 'tv1',
  kind: 'tv',
  name: 'TV',
  roomId: 'r1',
  order: 0,
  links: [link],
};

async function rig() {
  const { setup } = fakeTvSetup();
  const clearNotPaired = jest.fn();
  const webos = Object.assign(createFakeDriver('webos'), { clearNotPaired });
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [webos],
    tv: setup,
  });
  await s.store.upsertRoom({ id: 'r1', name: 'Room', order: 0 });
  await s.store.upsertDevice(tvDevice);
  return { s, setup, clearNotPaired };
}

const PROMPTS = { onAllow: () => undefined, askCode: () => Promise.resolve(null) };

describe('TV follow-up in services', () => {
  it('releases the driver latch after pairing again', async () => {
    const r = await rig();
    const paired: PairedTv = { link: { ...link, host: '192.168.1.40' }, suggestedName: 'TV' };
    r.setup.pair.mockResolvedValue(paired);
    const upsert = jest.spyOn(r.s.store, 'upsertDevice');
    await r.s.tv.pair({ kind: 'webos', host: link.host, name: 'TV', secure: true }, PROMPTS, link);
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      r.clearNotPaired.mock.invocationCallOrder[0] ?? 0,
    );
    const [saved] = await r.s.store.devices();
    expect(saved?.links[0]).toMatchObject({ host: '192.168.1.40' });
    expect(r.clearNotPaired).toHaveBeenCalledWith(
      'tv1',
      expect.objectContaining({ host: '192.168.1.40', clientKeyRef: 'key-1' }),
    );
  });

  it('does not touch the driver after a first pairing (no stored device yet)', async () => {
    const r = await rig();
    r.setup.pair.mockResolvedValue({
      link: { ...link, clientKeyRef: 'fresh' },
      suggestedName: 'TV',
    });
    await r.s.tv.pair({ kind: 'webos', host: link.host, name: 'TV', secure: true }, PROMPTS);
    expect(r.clearNotPaired).not.toHaveBeenCalled();
  });

  it('saves the address findAgain returns', async () => {
    const r = await rig();
    r.setup.findAgain.mockResolvedValue('192.168.1.40');
    expect(await r.s.tv.findAgain(tvDevice)).toBe('192.168.1.40');
    const [d] = await r.s.store.devices();
    expect(d?.links[0]).toMatchObject({ host: '192.168.1.40', mac: 'AA' });
  });

  it('saves nothing when the TV is not found', async () => {
    const r = await rig();
    r.setup.findAgain.mockResolvedValue(null);
    expect(await r.s.tv.findAgain(tvDevice)).toBeNull();
    const [d] = await r.s.store.devices();
    expect(d?.links[0]).toMatchObject({ host: '192.168.1.23' });
  });

  it('re-pairing an Android TV touches only that host and only the androidtv driver', async () => {
    const { setup } = fakeTvSetup();
    const atvClear = jest.fn();
    const webosClear = jest.fn();
    const drivers = [
      Object.assign(createFakeDriver('webos'), { clearNotPaired: webosClear }),
      Object.assign(createFakeDriver('androidtv'), { clearNotPaired: atvClear }),
    ];
    const s = createServices({
      store: createMemoryStore(),
      secrets: createMemorySecretStore(),
      prefs: createMemoryPreferenceStore(),
      drivers,
      tv: setup,
    });
    await s.store.upsertRoom({ id: 'r1', name: 'Room', order: 0 });
    const atv = (host: string) => ({
      kind: 'androidtv' as const,
      host,
      certRef: 'phone',
      pinSha256: 'p',
    });
    const dev = (id: string, host: string): Device => ({ ...tvDevice, id, links: [atv(host)] });
    await s.store.upsertDevice(dev('a1', '10.0.0.1'));
    await s.store.upsertDevice(dev('a2', '10.0.0.2'));
    const upsert = jest.spyOn(s.store, 'upsertDevice');
    setup.pair.mockResolvedValue({ link: atv('10.0.0.1'), suggestedName: 'A' });
    await s.tv.pair(
      { kind: 'androidtv', host: '10.0.0.1', name: 'A', secure: true },
      PROMPTS,
      atv('10.0.0.1'),
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(atvClear).toHaveBeenCalledTimes(1);
    expect(atvClear).toHaveBeenCalledWith('a1', expect.objectContaining({ host: '10.0.0.1' }));
    expect(webosClear).not.toHaveBeenCalled();
  });
});
