import { MiraieError, maskMiraiePhone, normalizeMiraiePhone } from '@/core';
import type { MiraieSetup, MiraieStatus, Unsubscribe } from '@/core';
import type { SecretStore } from '@/store/types';
import { TokenRejected } from './api';
import type { MiraieApi } from './api';
import { MqttError, mqttConnect } from './mqtt/client';
import type { MqttConnection } from './mqtt/client';
import { CloudNetError } from './net';
import type { CloudNet } from './net';
import { MIRAIE_BROKER_HOST, MIRAIE_BROKER_PORT } from './protocol';
import type { MiraieTokens } from './protocol';

/**
 * The opt-in MirAIe sign-in and the broker connections it opens.
 *
 * What is kept, and where: the phone number, the password and the tokens, as one entry in the
 * secret store (Keychain / Keystore), never in preferences and never logged. The password is kept
 * because MirAIe documents no token refresh: when a token expires, the app signs in again with it.
 * Disconnect deletes the entry. The opt-in itself (on/off, no secrets) is a preference.
 */
export const MIRAIE_SECRET_REF = 'miraie:account';

interface SavedAccount extends MiraieTokens {
  phone: string;
  password: string;
}

export interface MiraieSessionOptions {
  api: MiraieApi;
  /** For the broker. */
  net: CloudNet;
  secrets: SecretStore;
  /** The saved opt-in (a preference). */
  loadOptIn(): Promise<boolean>;
  saveOptIn(on: boolean): Promise<void>;
  now?: () => number;
  /** MQTT client id; random per connection by default. */
  clientId?: () => string;
  connectTimeoutMs?: number;
  keepAliveS?: number;
}

export interface MiraieSession extends MiraieSetup {
  /** Resolves once the saved opt-in and sign-in are loaded. */
  readonly ready: Promise<void>;
  /** On, signed in and the sign-in still works: the driver may send. */
  available(): boolean;
  /** Whether the transport may reach MirAIe now: on, or while signing in. */
  netAllowed(): boolean;
  /**
   * The broker session for a home, shared and opened on demand. Rejects MiraieError:
   * `off`/`signedOut`, or `offline` when the broker cannot be reached.
   */
  connection(homeId: string): Promise<MqttConnection>;
  /** Runs an API call with a valid token, signing in again once if the token is refused. */
  withToken<T>(fn: (token: string) => Promise<T>): Promise<T>;
}

/** Sign in again this long before the token expires. */
const RENEW_MARGIN_MS = 5 * 60_000;

const randomClientId = (): string =>
  `oneremote-${Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')}`;

function parseSaved(raw: string | null): SavedAccount | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedAccount>;
    if (typeof v.phone !== 'string' || typeof v.password !== 'string') return null;
    if (typeof v.userId !== 'string' || typeof v.accessToken !== 'string') return null;
    return v as SavedAccount;
  } catch {
    return null;
  }
}

export function createMiraieSession(o: MiraieSessionOptions): MiraieSession {
  const now = o.now ?? Date.now;
  const clientId = o.clientId ?? randomClientId;
  const connectTimeoutMs = o.connectTimeoutMs ?? 10_000;
  const keepAliveS = o.keepAliveS ?? 60;

  let enabled = false;
  let needsSignIn = false;
  let signingIn = 0;
  let account: SavedAccount | null = null;
  /** Bumped by sign-in and disconnect so late answers from before are dropped. */
  let generation = 0;
  let renewing: Promise<SavedAccount> | null = null;
  const connections = new Map<string, Promise<MqttConnection>>();
  const subs = new Set<() => void>();

  const notify = (): void => {
    for (const cb of [...subs]) {
      try {
        cb();
      } catch {
        // A listener's failure is its own.
      }
    }
  };

  const closeAll = (): void => {
    const open = [...connections.values()];
    connections.clear();
    for (const p of open) p.then((c) => c.close()).catch(() => undefined);
  };

  const ready = (async () => {
    try {
      const [on, raw] = await Promise.all([o.loadOptIn(), o.secrets.get(MIRAIE_SECRET_REF)]);
      enabled = on;
      account = parseSaved(raw);
      needsSignIn = on && account === null;
    } catch {
      enabled = false;
    }
    notify();
  })();

  const requireOn = (): SavedAccount => {
    if (!enabled) throw new MiraieError('off');
    if (!account || needsSignIn) throw new MiraieError('signedOut');
    return account;
  };

  const save = async (a: SavedAccount): Promise<void> => {
    await o.secrets.set(MIRAIE_SECRET_REF, JSON.stringify(a));
  };

  /** Signs in again with the saved password. A refused password needs the user. */
  const renew = (): Promise<SavedAccount> => {
    if (renewing) return renewing;
    const gen = generation;
    const current = requireOn();
    renewing = (async () => {
      try {
        const tokens = await o.api.login(current.phone, current.password);
        if (gen !== generation) throw new MiraieError('off');
        const next: SavedAccount = { phone: current.phone, password: current.password, ...tokens };
        account = next;
        await save(next).catch(() => undefined);
        return next;
      } catch (e) {
        if (
          e instanceof MiraieError &&
          (e.code === 'badLogin' || e.code === 'notRegistered') &&
          gen === generation
        ) {
          needsSignIn = true;
          closeAll();
          // Keep only the number, for the "sign in again" prompt; the refused password goes.
          await o.secrets.delete(MIRAIE_SECRET_REF).catch(() => undefined);
          notify();
          throw new MiraieError('signedOut');
        }
        throw e instanceof MiraieError ? e : new MiraieError('offline');
      } finally {
        renewing = null;
      }
    })();
    return renewing;
  };

  const fresh = async (): Promise<SavedAccount> => {
    const a = requireOn();
    if (a.expiresAt !== undefined && a.expiresAt - RENEW_MARGIN_MS <= now()) return renew();
    return a;
  };

  const withToken = async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
    await ready;
    const a = await fresh();
    try {
      return await fn(a.accessToken);
    } catch (e) {
      if (!(e instanceof TokenRejected)) throw e;
    }
    const b = await renew();
    try {
      return await fn(b.accessToken);
    } catch (e) {
      if (e instanceof TokenRejected) throw new MiraieError('signedOut');
      throw e;
    }
  };

  const dial = async (homeId: string, token: string): Promise<MqttConnection> => {
    let stream;
    try {
      stream = await o.net.openTls(MIRAIE_BROKER_HOST, MIRAIE_BROKER_PORT, connectTimeoutMs);
    } catch (e) {
      if (e instanceof CloudNetError && e.code === 'off') throw new MiraieError('off');
      throw new MiraieError('offline', e instanceof Error ? e.message : undefined);
    }
    return mqttConnect({
      stream,
      clientId: clientId(),
      username: homeId,
      password: token,
      keepAliveS,
      timeoutMs: connectTimeoutMs,
    });
  };

  const open = async (homeId: string): Promise<MqttConnection> => {
    await ready;
    const gen = generation;
    let a = await fresh();
    let conn: MqttConnection;
    try {
      conn = await dial(homeId, a.accessToken);
    } catch (e) {
      if (!(e instanceof MqttError && e.code === 'auth')) throw toMiraie(e);
      a = await renew();
      try {
        conn = await dial(homeId, a.accessToken);
      } catch (e2) {
        if (e2 instanceof MqttError && e2.code === 'auth') throw new MiraieError('signedOut');
        throw toMiraie(e2);
      }
    }
    if (gen !== generation || !enabled) {
      conn.close();
      throw new MiraieError('off');
    }
    return conn;
  };

  const connection = (homeId: string): Promise<MqttConnection> => {
    const existing = connections.get(homeId);
    if (existing) return existing;
    const p = open(homeId);
    connections.set(homeId, p);
    p.then(
      (c) =>
        c.onClose(() => {
          if (connections.get(homeId) === p) connections.delete(homeId);
        }),
      () => {
        if (connections.get(homeId) === p) connections.delete(homeId);
      },
    );
    return p;
  };

  return {
    ready,
    available: () => enabled && account !== null && !needsSignIn,
    netAllowed: () => enabled || signingIn > 0,

    status(): MiraieStatus {
      return {
        enabled,
        ...(account ? { account: maskMiraiePhone(account.phone) } : {}),
        needsSignIn: enabled && needsSignIn,
      };
    },

    subscribe(cb: () => void): Unsubscribe {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },

    async signIn(phoneInput, password) {
      await ready;
      const phone = normalizeMiraiePhone(phoneInput);
      if (!phone) throw new MiraieError('badPhone');
      if (password.length === 0) throw new MiraieError('badLogin');
      const gen = ++generation;
      signingIn++;
      try {
        const tokens = await o.api.login(phone, password);
        if (gen !== generation) throw new MiraieError('off');
        const next: SavedAccount = { phone, password, ...tokens };
        await save(next);
        await o.saveOptIn(true);
        if (gen !== generation) {
          await o.secrets.delete(MIRAIE_SECRET_REF).catch(() => undefined);
          throw new MiraieError('off');
        }
        closeAll();
        account = next;
        enabled = true;
        needsSignIn = false;
      } catch (e) {
        throw e instanceof MiraieError ? e : new MiraieError('offline');
      } finally {
        signingIn--;
      }
      notify();
    },

    async disconnect() {
      generation++;
      enabled = false;
      needsSignIn = false;
      account = null;
      closeAll();
      await Promise.allSettled([o.secrets.delete(MIRAIE_SECRET_REF), o.saveOptIn(false)]);
      notify();
    },

    listAcs: () => withToken((t) => o.api.listAcs(t)),
    connection,
    withToken,
  };
}

function toMiraie(e: unknown): MiraieError {
  if (e instanceof MiraieError) return e;
  return new MiraieError('offline', e instanceof Error ? e.message : undefined);
}
