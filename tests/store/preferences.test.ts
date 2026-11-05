import {
  createAsyncStoragePreferenceStore,
  createMemoryPreferenceStore,
  defaultPreferences,
  type PreferenceStore,
} from '@/store/preferences';
import type { AsyncStorageLike } from '@/store/types';

function memStorage(initial: Record<string, string> = {}): AsyncStorageLike {
  const m = new Map(Object.entries(initial));
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => {
      m.set(k, v);
    },
  };
}

const impls: [string, () => PreferenceStore][] = [
  ['memory', () => createMemoryPreferenceStore()],
  ['asyncStorage', () => createAsyncStoragePreferenceStore(memStorage())],
];

describe.each(impls)('PreferenceStore (%s)', (_n, make) => {
  it('returns defaults, then merges partial updates', async () => {
    const s = make();
    expect(await s.get()).toEqual(defaultPreferences);
    await s.set({ theme: 'dark' });
    await s.set({ tvPad: { tv1: 'dpad' } });
    expect(await s.get()).toEqual({ ...defaultPreferences, theme: 'dark', tvPad: { tv1: 'dpad' } });
  });

  it('notifies until unsubscribed', async () => {
    const s = make();
    const cb = jest.fn();
    const off = s.subscribe(cb);
    await s.set({ haptics: false });
    off();
    await s.set({ haptics: true });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does not fail the write', async () => {
    const s = make();
    s.subscribe(() => {
      throw new Error('boom');
    });
    await expect(s.set({ volumeKeys: false })).resolves.toBeUndefined();
  });
});

describe('asyncStorage preference store', () => {
  it('keeps the MirAIe cloud opt-in off by default, and remembers turning it on', async () => {
    const storage = memStorage();
    expect((await createAsyncStoragePreferenceStore(storage).get()).miraieCloud).toBe(false);
    await createAsyncStoragePreferenceStore(storage).set({ miraieCloud: true });
    expect((await createAsyncStoragePreferenceStore(storage).get()).miraieCloud).toBe(true);
  });

  it('persists across instances and merges over defaults', async () => {
    const storage = memStorage();
    await createAsyncStoragePreferenceStore(storage).set({ theme: 'light' });
    expect(await createAsyncStoragePreferenceStore(storage).get()).toEqual({
      ...defaultPreferences,
      theme: 'light',
    });
  });

  it('falls back to defaults on corrupt or wrongly shaped data, warning once', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = createAsyncStoragePreferenceStore(memStorage({ 'one-remote/prefs/v1': '{bad' }));
    expect(await s.get()).toEqual(defaultPreferences);
    expect(await s.get()).toEqual(defaultPreferences);
    expect(warn).toHaveBeenCalledTimes(1);
    const t = createAsyncStoragePreferenceStore(
      memStorage({
        'one-remote/prefs/v1': JSON.stringify({
          theme: 'neon',
          haptics: 'yes',
          miraieCloud: 'on',
          tvPad: { a: 'x', b: 'dpad' },
        }),
      }),
    );
    expect(await t.get()).toEqual({ ...defaultPreferences, tvPad: { b: 'dpad' } });
    warn.mockRestore();
  });

  it('keeps valid last-sent states, drops bad ones, and defaults when absent', async () => {
    const good = {
      kind: 'ac',
      state: { power: true, mode: 'cool', setpoint: 24, fan: 'auto', swing: false, sleep: false },
    };
    const s = createAsyncStoragePreferenceStore(
      memStorage({
        'one-remote/prefs/v1': JSON.stringify({ lastSent: { a: good, b: { kind: 'tv' }, c: 5 } }),
      }),
    );
    expect((await s.get()).lastSent).toEqual({ a: good });
    const old = createAsyncStoragePreferenceStore(
      memStorage({ 'one-remote/prefs/v1': JSON.stringify({ theme: 'dark' }) }),
    );
    expect((await old.get()).lastSent).toEqual({});
  });

  it('treats a last-sent entry missing a needed field as absent', async () => {
    const ac = { power: true, mode: 'cool', setpoint: 24, fan: 'auto', swing: false, sleep: false };
    const fan = { power: true, speed: 3, boost: false, sleep: false, timerHours: 0 };
    const s = createAsyncStoragePreferenceStore(
      memStorage({
        'one-remote/prefs/v1': JSON.stringify({
          lastSent: {
            okAc: { kind: 'ac', state: ac },
            okFan: { kind: 'fan', state: fan },
            noSetpoint: { kind: 'ac', state: { ...ac, setpoint: undefined } },
            badMode: { kind: 'ac', state: { ...ac, mode: 'heat' } },
            noSpeed: { kind: 'fan', state: { power: true } },
            badTimer: { kind: 'fan', state: { ...fan, timerHours: 3 } },
          },
        }),
      }),
    );
    expect(Object.keys((await s.get()).lastSent).sort()).toEqual(['okAc', 'okFan']);
  });
});
