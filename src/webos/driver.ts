import {
  DeviceError,
  type Capabilities,
  type Command,
  type Device,
  type Link,
  type LinkDriver,
  type Reported,
  type TvState,
  type Unsubscribe,
} from '@/core';
import { SsapClient } from './client';
import { rediscover } from './rediscover';
import { isPoweredOn, KEY_BUTTON, parseVolume, URI } from './ssap';
import type { TvSecrets, TvTransport } from './transport';
import { magicPacket } from './wol';

type WebosLink = Extract<Link, { kind: 'webos' }>;

export interface WebosDriverOpts {
  transport: TvTransport;
  secrets: Pick<TvSecrets, 'get' | 'set'>;
  /** Called once when the TV was found again at a new address (same MAC). */
  onHostChanged(deviceId: string, host: string): Promise<void>;
  /** Budget for a press to reach the TV, or be rejected `notSent` (1500). */
  connectMs?: number;
  heartbeatMs?: number;
  heartbeatTimeoutMs?: number;
  reconnectMs?: number[];
  /** The connection closes this long after its last use (10000). */
  idleCloseMs?: number;
}

const OFF_AFTER_MS = 3000;
const POWER_FALLBACK_MS = 1500;
const REDISCOVER_WHEN_OFF_MS = 30000;
const PROMPT_COOLDOWN_MS = 60000;

interface Session {
  client: SsapClient;
  stopped: boolean;
  powerKnown: boolean;
  appId: string | undefined;
  titles: Map<string, string>;
  timers: Set<ReturnType<typeof setTimeout>>;
  unsubs: Unsubscribe[];
}

interface Entry {
  deviceId: string;
  link: WebosLink;
  host: string;
  linkHost: string;
  client: SsapClient | undefined;
  connecting: Promise<SsapClient> | undefined;
  session: Session | undefined;
  observers: Set<(r: Reported) => void>;
  state: TvState | undefined;
  lastJson: string | undefined;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  attemptToken: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
  attempt: number;
  rediscovering: boolean;
  lastRediscoverAt: number | undefined;
  offEmitted: boolean;
  noKey: boolean;
  promptedAt: Map<string, number>;
  nextPlayPause: 'PAUSE' | 'PLAY';
}

function asDeviceError(e: unknown): DeviceError {
  if (e instanceof DeviceError && (e.code === 'notPaired' || e.code === 'notLocal')) return e;
  return new DeviceError('notSent', e instanceof Error ? e.message : String(e));
}

/** The `webos` link driver: one SSAP connection per TV, kept alive while the screen observes. */
export function createWebosDriver(o: WebosDriverOpts): LinkDriver & { kind: 'webos' } {
  const t = o.transport;
  const connectMs = o.connectMs ?? 1500;
  const heartbeatMs = o.heartbeatMs ?? 5000;
  const heartbeatTimeoutMs = o.heartbeatTimeoutMs ?? 3000;
  const backoff = o.reconnectMs ?? [250, 500, 1000, 2000, 5000];
  const idleCloseMs = o.idleCloseMs ?? 10000;
  const entries = new Map<string, Entry>();

  // ---- entries ---------------------------------------------------------------------------------

  function entryFor(device: Device, link: WebosLink): Entry {
    let e = entries.get(device.id);
    if (!e) {
      e = {
        deviceId: device.id,
        link,
        host: link.host,
        linkHost: link.host,
        client: undefined,
        connecting: undefined,
        session: undefined,
        observers: new Set(),
        state: undefined,
        lastJson: undefined,
        retryTimer: undefined,
        attemptToken: 0,
        idleTimer: undefined,
        attempt: 0,
        rediscovering: false,
        lastRediscoverAt: undefined,
        offEmitted: false,
        noKey: false,
        promptedAt: new Map(),
        nextPlayPause: 'PAUSE',
      };
      entries.set(device.id, e);
    }
    e.link = link;
    if (link.host !== e.linkHost) {
      // The stored host changed (we saved it, or the user edited it): follow it.
      e.linkHost = link.host;
      e.host = link.host;
    }
    return e;
  }

  // ---- reports ---------------------------------------------------------------------------------

  function emit(e: Entry): void {
    if (!e.state) return;
    const json = JSON.stringify(e.state);
    if (json === e.lastJson) return;
    e.lastJson = json;
    const report: Reported = { kind: 'tv', state: { ...e.state } };
    [...e.observers].forEach((cb) => cb(report));
  }

  function update(e: Entry, s: Session, delta: Partial<TvState>): void {
    const next: TvState = { ...(e.state ?? { power: true }) };
    for (const [k, v] of Object.entries(delta)) {
      if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
    }
    e.state = next;
    if (s.powerKnown) emit(e);
  }

  function emitOff(e: Entry): void {
    if (e.client || e.observers.size === 0) return;
    e.offEmitted = true;
    e.state = { power: false };
    emit(e);
  }

  // ---- connection ------------------------------------------------------------------------------

  async function doConnect(e: Entry): Promise<SsapClient> {
    const link = e.link;
    const key = await o.secrets.get(link.clientKeyRef);
    e.noKey = !key;
    if (!key) throw new DeviceError('notPaired', 'The TV is not paired');
    const host = e.host;
    const prompted = e.promptedAt.get(host);
    if (prompted !== undefined && Date.now() - prompted < PROMPT_COOLDOWN_MS) {
      throw new DeviceError('notPaired', 'The TV asked to pair again');
    }
    const started = Date.now();
    let client: SsapClient;
    try {
      client = await SsapClient.connect(t, { host, secure: link.secure }, connectMs);
    } catch (err) {
      throw asDeviceError(err);
    }
    let asked = false;
    try {
      await client.register(
        key,
        () => {
          asked = true;
          client.close();
        },
        Math.max(1, connectMs - (Date.now() - started)),
      );
    } catch (err) {
      client.close();
      if (asked) {
        // Our key is not known here: a revoked pairing, or another TV at this address. Do not
        // keep making a prompt appear on a TV screen.
        e.promptedAt.set(host, Date.now());
        throw new DeviceError('notPaired', 'The TV asked to pair again');
      }
      throw asDeviceError(err);
    }
    return client;
  }

  function connectOnce(e: Entry): Promise<SsapClient> {
    if (e.client) return Promise.resolve(e.client);
    if (!e.connecting) {
      e.connecting = doConnect(e).then(
        (client) => {
          e.connecting = undefined;
          install(e, client);
          return client;
        },
        (err: unknown) => {
          e.connecting = undefined;
          throw err;
        },
      );
    }
    return e.connecting;
  }

  function install(e: Entry, client: SsapClient): void {
    e.client = client;
    e.attempt = 0;
    e.offEmitted = false;
    client.onClose(() => onClientClosed(e, client, backoff[0] ?? 250));
    if (e.observers.size > 0) startSession(e, client);
    else scheduleIdle(e);
  }

  function onClientClosed(e: Entry, client: SsapClient, retryInMs: number): void {
    if (e.client !== client) return;
    e.client = undefined;
    stopSession(e, false);
    if (e.observers.size > 0) {
      e.attempt = 1;
      scheduleAttempt(e, retryInMs);
    }
  }

  function cancelAttempt(e: Entry): void {
    if (e.retryTimer) clearTimeout(e.retryTimer);
    e.retryTimer = undefined;
    e.attemptToken += 1;
  }

  function scheduleAttempt(e: Entry, delayMs: number): void {
    if (e.observers.size === 0) return;
    cancelAttempt(e);
    const token = e.attemptToken;
    if (delayMs <= 0) {
      // A microtask, not a zero timer: fake and real timers both treat "0" loosely.
      void Promise.resolve().then(() => {
        if (token === e.attemptToken) void runAttempt(e);
      });
      return;
    }
    e.retryTimer = setTimeout(() => {
      e.retryTimer = undefined;
      void runAttempt(e);
    }, delayMs);
  }

  function scheduleBackoff(e: Entry): void {
    const delay = backoff[Math.min(e.attempt, backoff.length - 1)] ?? 5000;
    e.attempt += 1;
    scheduleAttempt(e, delay);
  }

  async function runAttempt(e: Entry): Promise<void> {
    if (e.observers.size === 0 || e.client || e.rediscovering) return;
    try {
      await connectOnce(e);
    } catch (err) {
      await onConnectFailed(e, err);
    }
  }

  async function onConnectFailed(e: Entry, _err: unknown): Promise<void> {
    if (e.observers.size === 0) return;
    if (e.noKey) return; // nothing to retry until the TV is paired
    const onWifi = await t.onWifi().catch(() => false);
    if (!onWifi) {
      // Off the home Wi-Fi: say nothing, keep trying.
      scheduleBackoff(e);
      return;
    }
    const now = Date.now();
    if (
      e.offEmitted &&
      e.lastRediscoverAt !== undefined &&
      now - e.lastRediscoverAt < REDISCOVER_WHEN_OFF_MS
    ) {
      scheduleBackoff(e);
      return;
    }
    e.rediscovering = true;
    e.lastRediscoverAt = now;
    const offTimer = setTimeout(() => emitOff(e), OFF_AFTER_MS);
    let host: string | null = null;
    try {
      host = await rediscover(t, o.secrets, { ...e.link, host: e.host });
    } catch {
      host = null;
    }
    clearTimeout(offTimer);
    e.rediscovering = false;
    if (e.observers.size === 0) return;
    if (host) {
      if (host !== e.host) {
        e.host = host;
        try {
          await o.onHostChanged(e.deviceId, host);
        } catch {
          // The new host still works for this run; it is saved on the next change.
        }
      }
      scheduleAttempt(e, 0);
      return;
    }
    emitOff(e);
    scheduleBackoff(e);
  }

  // ---- session (subscriptions and heartbeat) -------------------------------------------------

  function startSession(e: Entry, client: SsapClient): void {
    stopSession(e, true);
    const s: Session = {
      client,
      stopped: false,
      powerKnown: false,
      appId: undefined,
      titles: new Map(),
      timers: new Set(),
      unsubs: [],
    };
    e.session = s;
    const later = (ms: number, fn: () => void): void => {
      const timer = setTimeout(() => {
        s.timers.delete(timer);
        if (!s.stopped) fn();
      }, ms);
      s.timers.add(timer);
    };
    const appTitle = (): string | undefined =>
      s.appId === undefined ? undefined : (s.titles.get(s.appId) ?? s.appId);

    s.unsubs.push(
      client.subscribe(URI.power, (p) => {
        const on = isPoweredOn(p);
        if (on === undefined) return;
        s.powerKnown = true;
        update(e, s, { power: on });
      }),
      client.subscribe(URI.volume, (p) => update(e, s, parseVolume(p))),
      client.subscribe(URI.foreground, (p) => {
        if (typeof p.appId !== 'string') return;
        s.appId = p.appId;
        update(e, s, { app: appTitle() });
      }),
    );
    client
      .request(URI.launchPoints)
      .then((r) => {
        if (s.stopped || !Array.isArray(r.launchPoints)) return;
        for (const lp of r.launchPoints as unknown[]) {
          const { id, title } = (lp ?? {}) as { id?: unknown; title?: unknown };
          if (typeof id === 'string' && typeof title === 'string') s.titles.set(id, title);
        }
        if (s.appId !== undefined) update(e, s, { app: appTitle() });
      })
      .catch(() => undefined);

    // Older firmware may not answer the power subscription: a connected TV is on.
    later(POWER_FALLBACK_MS, () => {
      if (s.powerKnown) return;
      s.powerKnown = true;
      update(e, s, { power: true });
    });

    const beat = (): void =>
      later(heartbeatMs, () => {
        client.request(URI.power, undefined, heartbeatTimeoutMs).then(
          (p) => {
            if (s.stopped) return;
            const on = isPoweredOn(p);
            if (on !== undefined) update(e, s, { power: on });
            beat();
          },
          () => {
            if (s.stopped) return;
            // No answer: the connection is dead. Reconnect at once, without telling observers.
            client.close();
            onClientClosed(e, client, 0);
          },
        );
      });
    beat();
  }

  function stopSession(e: Entry, unsubscribe: boolean): void {
    const s = e.session;
    if (!s) return;
    s.stopped = true;
    s.timers.forEach(clearTimeout);
    s.timers.clear();
    if (unsubscribe) s.unsubs.forEach((u) => u());
    e.session = undefined;
  }

  // ---- idle close --------------------------------------------------------------------------------

  function scheduleIdle(e: Entry): void {
    if (e.observers.size > 0) return;
    if (e.idleTimer) clearTimeout(e.idleTimer);
    e.idleTimer = setTimeout(() => {
      e.idleTimer = undefined;
      if (e.observers.size > 0) return;
      const c = e.client;
      e.client = undefined;
      stopSession(e, false);
      c?.close();
    }, idleCloseMs);
  }

  // ---- sending ---------------------------------------------------------------------------------

  function withinBudget<T>(ms: number, p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new DeviceError('notSent', 'connect timed out')), ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(asDeviceError(err));
        },
      );
    });
  }

  async function sendOverSsap(
    e: Entry,
    cmd: Extract<Command, { kind: 'tv.key' | 'tv.text' }>,
  ): Promise<void> {
    const started = Date.now();
    const client = await withinBudget(connectMs, connectOnce(e));
    const left = connectMs - (Date.now() - started);
    if (left <= 0) throw new DeviceError('notSent', 'connect timed out');
    if (cmd.kind === 'tv.text') {
      await client.request(URI.insertText, { text: cmd.text, replace: true }, left);
      return;
    }
    switch (cmd.key) {
      case 'power':
        await client.request(URI.turnOff, undefined, left);
        return;
      case 'input':
        await client.request(URI.launch, { id: 'com.webos.app.inputpicker' }, left);
        return;
      case 'playPause': {
        const name = e.nextPlayPause;
        await client.button(name, left);
        e.nextPlayPause = name === 'PAUSE' ? 'PLAY' : 'PAUSE';
        return;
      }
      default:
        await client.button(KEY_BUTTON[cmd.key], left);
    }
  }

  // ---- LinkDriver ------------------------------------------------------------------------------

  return {
    kind: 'webos',
    available: () => true,
    capabilities: (): Capabilities => ({}),

    supports(device: Device, link: Link, cmd: Command): boolean {
      if (link.kind !== 'webos') return false;
      if (cmd.kind === 'tv.key' || cmd.kind === 'tv.text') return true;
      // With IR on the phone, power-on goes over IR, the reliable path.
      if (cmd.kind === 'tv.powerOn')
        return !!link.mac && !device.links.some((l) => l.kind === 'ir');
      return false;
    },

    async send(device: Device, link: Link, cmd: Command): Promise<void> {
      if (link.kind !== 'webos') throw new DeviceError('unsupported');
      if (cmd.kind === 'tv.powerOn') {
        if (!link.mac) throw new DeviceError('unsupported', 'No MAC address saved for this TV');
        try {
          await t.sendWol(magicPacket(link.mac));
        } catch (err) {
          throw asDeviceError(err);
        }
        return;
      }
      if (cmd.kind !== 'tv.key' && cmd.kind !== 'tv.text') throw new DeviceError('unsupported');
      const e = entryFor(device, link);
      try {
        await sendOverSsap(e, cmd);
      } finally {
        scheduleIdle(e);
      }
    },

    observe(device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe {
      if (link.kind !== 'webos') return () => undefined;
      const e = entryFor(device, link);
      e.observers.add(cb);
      if (e.idleTimer) {
        clearTimeout(e.idleTimer);
        e.idleTimer = undefined;
      }
      if (e.state) cb({ kind: 'tv', state: { ...e.state } });
      if (e.client) {
        if (!e.session) startSession(e, e.client);
      } else if (!e.retryTimer && !e.rediscovering && !e.connecting) {
        e.attempt = 0;
        e.noKey = false;
        scheduleAttempt(e, 0);
      }
      return () => {
        e.observers.delete(cb);
        if (e.observers.size > 0) return;
        cancelAttempt(e);
        stopSession(e, true);
        scheduleIdle(e);
      };
    },
  };
}
