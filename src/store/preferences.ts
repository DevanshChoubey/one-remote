import type { AcState, FanState, Unsubscribe } from '@/core';
import { notifyAll, subscribeTo } from './memoryStore';
import type { AsyncStorageLike } from './types';

/** The last state sent to an appliance that cannot report its own (IR), kept across restarts. */
export type LastSent = { kind: 'ac'; state: AcState } | { kind: 'fan'; state: FanState };

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  volumeKeys: boolean;
  haptics: boolean;
  tvPad: Record<string, 'touchpad' | 'dpad'>;
  lastSent: Record<string, LastSent>;
}

export const defaultPreferences: Preferences = {
  theme: 'system',
  volumeKeys: true,
  haptics: true,
  tvPad: {},
  lastSent: {},
};

export interface PreferenceStore {
  get(): Promise<Preferences>;
  set(p: Partial<Preferences>): Promise<void>;
  subscribe(cb: () => void): Unsubscribe;
}

const KEY = 'one-remote/prefs/v1';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps only valid fields, so a bad value falls back to its default. */
function sanitize(v: unknown): Partial<Preferences> {
  if (!isRecord(v)) return {};
  const out: Partial<Preferences> = {};
  if (v.theme === 'system' || v.theme === 'light' || v.theme === 'dark') out.theme = v.theme;
  if (typeof v.volumeKeys === 'boolean') out.volumeKeys = v.volumeKeys;
  if (typeof v.haptics === 'boolean') out.haptics = v.haptics;
  if (isRecord(v.tvPad)) {
    const pad: Preferences['tvPad'] = {};
    for (const [k, mode] of Object.entries(v.tvPad)) {
      if (mode === 'touchpad' || mode === 'dpad') pad[k] = mode;
    }
    out.tvPad = pad;
  }
  if (isRecord(v.lastSent)) {
    const sent: Preferences['lastSent'] = {};
    for (const [k, e] of Object.entries(v.lastSent)) {
      if (isRecord(e) && (e.kind === 'ac' || e.kind === 'fan') && isRecord(e.state)) {
        if (typeof e.state.power === 'boolean') sent[k] = e as unknown as LastSent;
      }
    }
    out.lastSent = sent;
  }
  return out;
}

const merge = (base: Preferences, patch: Partial<Preferences>): Preferences => ({
  ...base,
  ...patch,
  tvPad: { ...(patch.tvPad ?? base.tvPad) },
  lastSent: { ...(patch.lastSent ?? base.lastSent) },
});

export function createMemoryPreferenceStore(): PreferenceStore {
  let current = merge(defaultPreferences, {});
  const subs = new Set<() => void>();
  return {
    get: async () => merge(current, {}),
    set: async (p) => {
      current = merge(current, p);
      notifyAll(subs);
    },
    subscribe: (cb) => subscribeTo(subs, cb),
  };
}

export function createAsyncStoragePreferenceStore(storage: AsyncStorageLike): PreferenceStore {
  const subs = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();
  let warned = false;

  const read = async (): Promise<Preferences> => {
    const raw = await storage.getItem(KEY);
    if (raw === null) return merge(defaultPreferences, {});
    try {
      return merge(defaultPreferences, sanitize(JSON.parse(raw)));
    } catch {
      if (!warned) {
        warned = true;
        console.warn('one-remote: stored preferences are corrupt; using defaults');
      }
      return merge(defaultPreferences, {});
    }
  };

  return {
    get: async () => {
      await tail;
      return read();
    },
    set: (p) => {
      const run = tail.then(async () => {
        await storage.setItem(KEY, JSON.stringify(merge(await read(), p)));
      });
      tail = run.catch(() => undefined);
      return run.then(() => notifyAll(subs));
    },
    subscribe: (cb) => subscribeTo(subs, cb),
  };
}
