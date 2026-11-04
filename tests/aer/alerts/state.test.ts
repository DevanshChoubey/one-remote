// From aer-remote tests/alerts/state.test.ts (2026-11-04). Adapted: imports, bleId/storage keys/app name renamed for One Remote, switches per group.
import { createAlertStateStore } from '@/aer/alerts/state';
import type { AsyncStorageLike } from '@/store/types';

function memoryStorage(initial: Record<string, string> = {}): AsyncStorageLike & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

describe('alert state store', () => {
  it('round-trips state', async () => {
    const store = createAlertStateStore(memoryStorage());
    const state = {
      'dev1:refillLow': { at: '2026-10-27T10:00:00.000Z', cycle: '42' },
      'dev1:batteryFlat': { at: '2026-10-27T11:00:00.000Z', cycle: 'set' },
    };
    await store.save(state);
    expect(await store.load()).toEqual(state);
  });

  it('corrupt JSON loads as empty', async () => {
    const storage = memoryStorage({ 'one-remote/aer-alerts/v1': '{not json' });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await createAlertStateStore(storage).load()).toEqual({});
  });

  it('loads empty when nothing is saved', async () => {
    expect(await createAlertStateStore(memoryStorage()).load()).toEqual({});
  });

  it('loads empty when the saved value is not an object', async () => {
    const storage = memoryStorage({ 'one-remote/aer-alerts/v1': '[1,2,3]' });
    expect(await createAlertStateStore(storage).load()).toEqual({});
  });

  it('switches default to all on and save each group', async () => {
    const storage = memoryStorage();
    const store = createAlertStateStore(storage);
    expect(await store.switches()).toEqual({ refill: true, battery: true, checkIn: true });
    await store.setSwitch('battery', false);
    expect(await store.switches()).toEqual({ refill: true, battery: false, checkIn: true });
    await store.setSwitch('battery', true);
    expect(await store.switches()).toEqual({ refill: true, battery: true, checkIn: true });
  });

  it('stores the switches', async () => {
    const storage = memoryStorage();
    await createAlertStateStore(storage).setSwitch('checkIn', false);
    expect(JSON.parse(storage.data.get('one-remote/aer-alerts/switches') ?? '')).toEqual({
      refill: true,
      battery: true,
      checkIn: false,
    });
    expect(await createAlertStateStore(storage).switches()).toEqual({
      refill: true,
      battery: true,
      checkIn: false,
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad = memoryStorage({ 'one-remote/aer-alerts/switches': '{bad' });
    expect(await createAlertStateStore(bad).switches()).toEqual({
      refill: true,
      battery: true,
      checkIn: true,
    });
  });

  it('remembers that the app asked for permission', async () => {
    const storage = memoryStorage();
    const store = createAlertStateStore(storage);
    expect(await store.asked()).toBe(false);
    await store.setAsked();
    expect(storage.data.get('one-remote/aer-alerts/asked')).toBe('true');
    expect(await createAlertStateStore(storage).asked()).toBe(true);
  });

  it('treats an unreadable asked flag as not asked', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = createAlertStateStore({
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => undefined,
    });
    expect(await store.asked()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
