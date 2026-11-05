import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { createFakeDriver } from '@/device/testing/fakeDriver';
import { createServices, ServicesProvider } from '@/services';
import type { Services } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';
import { useVolumeKeys } from '@/screens/tv/useVolumeKeys';
import { room } from '../helpers';

jest.mock('react-native-udp');
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockModule = {
  setEnabled: jest.fn(),
  remove: jest.fn(),
  emit: undefined as ((e: { direction: 'up' | 'down' }) => void) | undefined,
  addListener: jest.fn(),
};
jest.mock('../../../modules/volume-keys', () => ({
  get VolumeKeys() {
    return mockModule;
  },
}));

async function rig(volumeKeys: boolean): Promise<{
  s: Services;
  sent: () => unknown[];
  wrap: (p: { children: ReactNode }) => ReactNode;
}> {
  const webos = createFakeDriver('webos');
  const s = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [webos],
  });
  await s.prefs.set({ volumeKeys });
  await s.store.upsertRoom(room('r1', 'Room', 0));
  await s.store.upsertDevice({
    id: 'tv1',
    kind: 'tv',
    name: 'TV',
    roomId: 'r1',
    order: 0,
    links: [{ kind: 'webos', host: '192.168.1.23', secure: true, clientKeyRef: 'k' }],
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    s,
    sent: () => webos.sent.map((x) => x.cmd),
    wrap: ({ children }) => <ServicesProvider services={s}>{children}</ServicesProvider>,
  };
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  mockModule.setEnabled.mockClear();
  mockModule.remove.mockClear();
  mockModule.addListener.mockReset();
  mockModule.addListener.mockImplementation(
    (_event: string, cb: (e: { direction: 'up' | 'down' }) => void) => {
      mockModule.emit = cb;
      return { remove: mockModule.remove };
    },
  );
});

describe('useVolumeKeys', () => {
  it('turns the TV volume with the volume keys on Android', async () => {
    const r = await rig(true);
    await renderHook(() => useVolumeKeys('tv1', true), { wrapper: r.wrap });
    await settle();
    expect(mockModule.setEnabled).toHaveBeenCalledWith(true);
    await act(async () => mockModule.emit?.({ direction: 'up' }));
    await act(async () => mockModule.emit?.({ direction: 'down' }));
    await settle();
    expect(r.sent()).toEqual([
      { kind: 'tv.key', key: 'volumeUp' },
      { kind: 'tv.key', key: 'volumeDown' },
    ]);
  });

  it('stays off when the preference is off', async () => {
    const r = await rig(false);
    await renderHook(() => useVolumeKeys('tv1', true), { wrapper: r.wrap });
    await settle();
    expect(mockModule.setEnabled).not.toHaveBeenCalledWith(true);
  });

  it('stays off when the screen is not active', async () => {
    const r = await rig(true);
    await renderHook(() => useVolumeKeys('tv1', false), { wrapper: r.wrap });
    await settle();
    expect(mockModule.setEnabled).not.toHaveBeenCalled();
  });

  it('does nothing on iPhone', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    const r = await rig(true);
    await renderHook(() => useVolumeKeys('tv1', true), { wrapper: r.wrap });
    await settle();
    expect(mockModule.setEnabled).not.toHaveBeenCalled();
    expect(mockModule.addListener).not.toHaveBeenCalled();
  });

  it('gives the keys back on unmount', async () => {
    const r = await rig(true);
    const view = await renderHook(() => useVolumeKeys('tv1', true), { wrapper: r.wrap });
    await settle();
    await view.unmount();
    expect(mockModule.setEnabled).toHaveBeenLastCalledWith(false);
    expect(mockModule.remove).toHaveBeenCalled();
  });
});
