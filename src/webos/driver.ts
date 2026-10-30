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
import { SsapClient, SsapReplyError } from './client';
import { rediscover } from './rediscover';
import { isPoweredOn, KEY_BUTTON, parseVolume, URI } from './ssap';
import type { TvSecretsWithDelete, TvTransport } from './transport';
import { magicPacket } from './wol';

type WebosLink = Extract<Link, { kind: 'webos' }>;

export interface WebosDriverOpts {
  transport: TvTransport;
  secrets: TvSecretsWithDelete;
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
const REDISCOVER_EVERY_MS = 30000;
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
  offTimer: ReturnType<typeof setTimeout> | undefined;
  /** The TV (or something at its address) asked us to pair since the last failed connect. */
  sawPrompt: boolean;
  /** A register produced a prompt: stay quiet until `clearNotPaired` or an app restart. */
  notPaired: boolean;
  noKey: boolean;
  nextPlayPause: 'PAUSE' | 'PLAY';
}

function asDeviceError(e: unknown): DeviceError {
  if (e instanceof DeviceError && (e.code === 'notPaired' || e.code === 'notLocal')) return e;
  return new DeviceError('notSent', e instanceof Error ? e.message : String(e));
}

/** The `webos` link driver: one SSAP connection per TV, kept alive while the screen observes. */
export function createWebosDriver(
  o: WebosDriverOpts,
): LinkDriver & { kind: 'webos'; clearNotPaired(deviceId: string, link?: WebosLink): void } {
  const t = o.transport;
  const connectMs = o.connectMs ?? 1500;
  const heartbeatMs = o.heartbeatMs ?? 5000;
  const heartbeatTimeoutMs = o.heartbeatTimeoutMs ?? 3000;
  const backoff = o.reconnectMs ?? [250, 500, 1000, 2000, 5000];
  const idleCloseMs = o.idleCloseMs ?? 10000;
  const entries = new Map<string, Entry>();
  /** Hosts that answered our register with a prompt, and when. Shared with rediscovery. */
  const promptedAt = new Map<string, number>();
  const isHeldOff = (host: string): boolean => {
    const at = promptedAt.get(host);
    return at !== undefined && Date.now() - at < PROMPT_COOLDOWN_MS;
  };
  /** One rediscovery (and so one subnet probe) at a time, across all TVs. */
  let probing = false;

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
        offTimer: undefined,
        sawPrompt: false,
        notPaired: false,
        noKey: false,
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
    if (e.notPaired) throw new DeviceError('notPaired', 'The TV asked to pair again');
    const link = e.link;
    const [key, pin] = await Promise.all([
      o.secrets.get(link.clientKeyRef),
      link.secure ? o.secrets.get(`${link.clientKeyRef}:cert`) : Promise.resolve(null),
    ]);
    // A wss link is only ever opened against the certificate pinned at pairing.
    e.noKey = !key || (link.secure && !pin);
    if (!key) throw new DeviceError('notPaired', 'The TV is not paired');
    if (link.secure && !pin) {
      throw new DeviceError('notPaired', "No pinned certificate for the TV's secure port");
    }
    const host = e.host;
    if (isHeldOff(host)) {
      e.sawPrompt = true;
      throw new DeviceError('notPaired', 'The TV asked to pair again');
    }
    const started = Date.now();
    let client: SsapClient;
    try {
      client = await SsapClient.connect(
        t,
        { host, secure: link.secure, ...(pin ? { pinSha256: pin } : {}) },
        connectMs,
      );
    } catch (err) {
      if (err instanceof DeviceError && err.code === 'notPaired') {
        // The TV's certificate is not the one pinned at pairing (a renewed certificate, or another
        // TV at this address). Like a prompt: stop retrying and let sends say "Pair again",
        // instead of showing the TV as off.
        e.sawPrompt = true;
        e.notPaired = true;
      }
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
        promptedAt.set(host, Date.now());
        e.sawPrompt = true;
        e.notPaired = true;
        throw new DeviceError('notPaired', 'The TV asked to pair again');
      }
      throw asDeviceError(err);
    }
    // A register on our own host succeeded: the pairing is good, whatever a racing path said.
    e.notPaired = false;
    e.sawPrompt = false;
    promptedAt.delete(host);
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
    e.lastRediscoverAt = undefined;
    e.sawPrompt = false;
    clearOffTimer(e);
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

  function clearOffTimer(e: Entry): void {
    if (e.offTimer) clearTimeout(e.offTimer);
    e.offTimer = undefined;
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
    if (e.observers.size === 0 || e.client || e.rediscovering || e.notPaired) return;
    e.sawPrompt = false;
    try {
      await connectOnce(e);
    } catch (err) {
      await onConnectFailed(e, err);
    }
  }

  async function onConnectFailed(e: Entry, _err: unknown): Promise<void> {
    if (e.observers.size === 0) return;
    if (e.noKey || e.notPaired) return; // nothing to retry until the TV is paired
    const onWifi = await t.onWifi().catch(() => false);
    if (!onWifi) {
      // Off the home Wi-Fi: say nothing, keep trying.
      scheduleBackoff(e);
      return;
    }
    const now = Date.now();
    const throttled =
      e.lastRediscoverAt !== undefined && now - e.lastRediscoverAt < REDISCOVER_EVERY_MS;
    if (throttled || probing) {
      scheduleBackoff(e);
      return;
    }
    if (!e.link.mac) {
      // Without a MAC the TV cannot be told from another one, so it cannot be searched for. Say
      // "off" only after the usual wait, not at the first refused connect.
      if (!e.offTimer) {
        e.offTimer = setTimeout(() => {
          e.offTimer = undefined;
          emitOff(e);
        }, OFF_AFTER_MS);
      }
      scheduleBackoff(e);
      return;
    }
    e.rediscovering = true;
    probing = true;
    e.lastRediscoverAt = now;
    const offTimer = setTimeout(() => {
      if (!e.sawPrompt) emitOff(e);
    }, OFF_AFTER_MS);
    let host: string | null = null;
    try {
      host = await rediscover(
        t,
        o.secrets,
        { ...e.link, host: e.host },
        {
          connectMs,
          isHeldOff,
          // A candidate that prompts is a different TV: hold that host off and go on. Only a
          // prompt on the link's own host (doConnect) means our pairing is gone.
          onPrompted: (h) => {
            promptedAt.set(h, Date.now());
          },
        },
      );
    } catch {
      host = null;
    }
    clearTimeout(offTimer);
    probing = false;
    e.rediscovering = false;
    const moved = host !== null && host !== e.host;
    if (moved && host) {
      // Save the new address even if nobody is watching any more.
      e.host = host;
      try {
        await o.onHostChanged(e.deviceId, host);
      } catch {
        // The new host still works for this run; it is saved on the next change.
      }
    }
    if (e.observers.size === 0) return;
    if (host) {
      // A changed host is worth trying at once; the same host that just failed is not.
      if (moved) scheduleAttempt(e, 0);
      else scheduleBackoff(e);
      return;
    }
    // The link's own host may have prompted meanwhile (notPaired): then say nothing more.
    if (e.notPaired) return;
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
          (err: unknown) => {
            if (s.stopped) return;
            // Any reply, even an error, proves the link is alive.
            if (err instanceof SsapReplyError) {
              beat();
              return;
            }
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

  /** Nothing is written once the hub has given up; a frame already written is never taken back. */
  function refuseIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new DeviceError('notSent', 'The send was cancelled');
  }

  async function sendOverSsap(
    e: Entry,
    cmd: Extract<Command, { kind: 'tv.key' | 'tv.text' }>,
    signal?: AbortSignal,
  ): Promise<void> {
    const started = Date.now();
    const client = await withinBudget(connectMs, connectOnce(e));
    refuseIfAborted(signal);
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
    /** Call after a successful `pairTv` for this device, with its stored link (the host and key
     *  may have changed): lets the driver connect again. */
    clearNotPaired(deviceId: string, link?: WebosLink): void {
      const e = entries.get(deviceId);
      if (!e) return;
      for (const h of new Set([e.host, e.linkHost, link?.host])) {
        if (h) promptedAt.delete(h);
      }
      if (link) {
        e.link = link;
        e.linkHost = link.host;
        e.host = link.host;
      }
      e.notPaired = false;
      e.sawPrompt = false;
      e.attempt = 0;
      if (e.observers.size > 0 && !e.client) scheduleAttempt(e, 0);
    },
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

    async send(device: Device, link: Link, cmd: Command, signal?: AbortSignal): Promise<void> {
      if (link.kind !== 'webos') throw new DeviceError('unsupported');
      refuseIfAborted(signal);
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
      if (e.notPaired) throw new DeviceError('notPaired', 'The TV asked to pair again');
      try {
        await sendOverSsap(e, cmd, signal);
      } finally {
        scheduleIdle(e);
      }
    },

    /** Deletes this TV's client key, USN and certificate pin and drops its connection. Idempotent: a secret
     *  that is already gone is fine. All three deletes are tried; the first failure is rethrown. */
    async forget(device: Device, link: Link): Promise<void> {
      if (link.kind !== 'webos') return;
      const e = entries.get(device.id);
      if (e) {
        cancelAttempt(e);
        clearOffTimer(e);
        if (e.idleTimer) clearTimeout(e.idleTimer);
        e.idleTimer = undefined;
        e.observers.clear();
        stopSession(e, true);
        const c = e.client;
        e.client = undefined;
        c?.close();
        entries.delete(device.id);
      }
      const results = await Promise.allSettled(
        [link.clientKeyRef, `${link.clientKeyRef}:usn`, `${link.clientKeyRef}:cert`].map((ref) =>
          o.secrets.delete(ref),
        ),
      );
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
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
      } else if (!e.retryTimer && !e.rediscovering && !e.connecting && !e.notPaired) {
        e.attempt = 0;
        e.noKey = false;
        scheduleAttempt(e, 0);
      }
      return () => {
        e.observers.delete(cb);
        if (e.observers.size > 0) return;
        cancelAttempt(e);
        clearOffTimer(e);
        stopSession(e, true);
        scheduleIdle(e);
      };
    },
  };
}
