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

const isBool = (v: unknown): boolean => typeof v === 'boolean';
const isOptBool = (v: unknown): boolean => v === undefined || isBool(v);
const isLevel = (v: unknown): boolean => v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
const SWING_H = ['auto', 'fullLeft', 'left', 'middle', 'right', 'fullRight'];

/** True only when every field the screen and the encoder need is present and of the right type. */
function validState(kind: unknown, s: unknown): boolean {
  if (!isRecord(s)) return false;
  if (kind === 'ac') {
    return (
      isBool(s.power) &&
      ['cool', 'dry', 'fan', 'auto'].includes(String(s.mode)) &&
      typeof s.setpoint === 'number' &&
      Number.isFinite(s.setpoint) &&
      (s.fan === 'auto' || isLevel(s.fan)) &&
      isBool(s.swing) &&
      isBool(s.sleep) &&
      (s.swingV === undefined || s.swingV === 'auto' || isLevel(s.swingV)) &&
      (s.swingH === undefined || (typeof s.swingH === 'string' && SWING_H.includes(s.swingH))) &&
      isOptBool(s.powerful) &&
      isOptBool(s.quiet) &&
      isOptBool(s.ion)
    );
  }
  if (kind === 'fan') {
    return (
      isBool(s.power) &&
      [1, 2, 3, 4, 5].includes(Number(s.speed)) &&
      typeof s.speed === 'number' &&
      isBool(s.boost) &&
      isBool(s.sleep) &&
      [0, 1, 2, 4, 8].includes(Number(s.timerHours)) &&
      typeof s.timerHours === 'number' &&
      (s.light === undefined || isBool(s.light))
    );
  }
  return false;
}

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
      if (isRecord(e) && validState(e.kind, e.state)) sent[k] = e as unknown as LastSent;
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
