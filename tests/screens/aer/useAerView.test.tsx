import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import { createFakeAlerts } from '@/aer/testing/fakeAlerts';
import { useAerView } from '@/screens/aer/useAerView';
import { createServices, ServicesProvider } from '@/services';
import { createMemoryStore } from '@/store/memoryStore';
import { createMemoryPreferenceStore } from '@/store/preferences';
import { createMemorySecretStore } from '@/store/secrets';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

function setup() {
  const aer = createFakeAerService();
  const real = aer.subscribe.bind(aer);
  const subscribe = jest.spyOn(aer, 'subscribe');
  const services = createServices({
    store: createMemoryStore(),
    secrets: createMemorySecretStore(),
    prefs: createMemoryPreferenceStore(),
    drivers: [],
    aer,
    aerAlerts: createFakeAlerts(),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  return { aer, subscribe, real, wrapper };
}

describe('useAerView', () => {
  it('re-renders on setView', async () => {
    const { aer, wrapper } = setup();
    const { result } = await renderHook(() => useAerView('d1'), { wrapper });
    expect(result.current).toEqual({ deviceId: 'd1' });
    await act(async () => aer.setView({ deviceId: 'd1', clockSet: true }));
    expect(result.current.clockSet).toBe(true);
  });

  it('unsubscribes on unmount and sets no state afterwards', async () => {
    const { aer, subscribe, real, wrapper } = setup();
    const unsub = jest.fn();
    subscribe.mockImplementation((id, cb) => {
      const off = real(id, cb);
      return () => {
        unsub();
        off();
      };
    });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = await renderHook(() => useAerView('d1'), { wrapper });
    expect(unsub).not.toHaveBeenCalled();
    await unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
    aer.setView({ deviceId: 'd1', clockSet: true });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('re-subscribes when deviceId changes', async () => {
    const { aer, subscribe, wrapper } = setup();
    const { result, rerender } = await renderHook((p: { id: string }) => useAerView(p.id), {
      wrapper,
      initialProps: { id: 'd1' },
    });
    await rerender({ id: 'd2' });
    expect(subscribe.mock.calls.map((c) => c[0])).toEqual(['d1', 'd2']);
    await act(async () => aer.setView({ deviceId: 'd2', clockSet: true }));
    expect(result.current).toEqual({ deviceId: 'd2', clockSet: true });
    // d1 is no longer watched
    await act(async () => aer.setView({ deviceId: 'd1', clockSet: true }));
    expect(result.current.deviceId).toBe('d2');
  });
});
