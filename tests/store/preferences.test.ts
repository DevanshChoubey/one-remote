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
          tvPad: { a: 'x', b: 'dpad' },
        }),
      }),
    );
    expect(await t.get()).toEqual({ ...defaultPreferences, tvPad: { b: 'dpad' } });
    warn.mockRestore();
  });
});
