import type { Device } from '@/core';
import { createServices } from '@/services';
import { webosHostChanged } from '@/services/createServices';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import type { TvTransport } from '@/webos/transport';

jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));
jest.mock('expo-network', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function fakeTransport(): TvTransport & { calls: jest.Mock[] } {
  const open = jest.fn();
  const ssdpSearch = jest.fn();
  const probe = jest.fn();
  const sendWol = jest.fn();
  const onWifi = jest.fn();
  return {
    open,
    ssdpSearch,
    probe,
    sendWol,
    onWifi,
    calls: [open, ssdpSearch, probe, sendWol, onWifi],
  };
}

const tvDevice: Device = {
  id: 'tv1',
  kind: 'tv',
  name: 'TV',
  roomId: 'r',
  order: 0,
  links: [
    { kind: 'ir', remoteId: 'x/y' },
    {
      kind: 'webos',
      host: '192.168.1.20',
      mac: 'aa:bb:cc:dd:ee:ff',
      secure: false,
      clientKeyRef: 'k',
    },
  ],
};

function make() {
  const tvTransport = fakeTransport();
  const store = createMemoryStore();
  const services = createServices({
    tvTransport,
    store,
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
  });
  return { tvTransport, store, services };
}

describe('TV wiring', () => {
  it('provides services.tv and a webos driver, and touches no transport method', () => {
    const { tvTransport, services } = make();
    expect(typeof services.tv.discover).toBe('function');
    expect(typeof services.tv.pair).toBe('function');
    expect(services.drivers.some((d) => d.kind === 'webos')).toBe(true);
    tvTransport.calls.forEach((c) => expect(c).not.toHaveBeenCalled());
  });

  it('onFrame is exposed in dev and reports nothing until used', () => {
    const { services } = make();
    const seen: string[] = [];
    const stop = services.tv.onFrame?.((f) => seen.push(f.text));
    expect(stop).toBeDefined();
    stop?.();
    expect(seen).toEqual([]);
  });

  it('onHostChanged replaces only the webos link host', async () => {
    const { store } = make();
    await store.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await store.upsertDevice(tvDevice);
    await webosHostChanged(store)('tv1', '192.168.1.40');
    const [d] = await store.devices();
    expect(d?.links).toEqual([
      { kind: 'ir', remoteId: 'x/y' },
      { ...tvDevice.links[1], host: '192.168.1.40' },
    ]);
  });

  it('onHostChanged does nothing when the device is gone', async () => {
    const { store } = make();
    await webosHostChanged(store)('nope', '192.168.1.40');
    expect(await store.devices()).toEqual([]);
  });
});
