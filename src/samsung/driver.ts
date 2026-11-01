import {
  DeviceError,
  type Capabilities,
  type Command,
  type Device,
  type Link,
  type LinkDriver,
  type Reported,
  type TvLink,
  type TvState,
  type Unsubscribe,
} from '@/core';
import type { TvSecretsWithDelete, TvTransport } from '@/tv/transport';
import { magicPacket } from '@/tv/wol';
import { SamsungClient } from './client';
import { fetchInfo } from './info';
import { KEY_NAME, PLAY_PAUSE_CYCLE } from './keys';
import { rediscoverSamsung } from './rediscover';

type SamsungLink = Extract<TvLink, { kind: 'samsung' }>;

export interface SamsungDriverOpts {
  transport: TvTransport;
  secrets: TvSecretsWithDelete;
  /** Called once when the TV was found again at a new address (same MAC). */
  onHostChanged(deviceId: string, host: string): Promise<void>;
  /** Budget for a press to reach the TV, or be rejected `notSent` (1500). */
  connectMs?: number;
  /** Info-page poll while observed (5000). */
  pollMs?: number;
  reconnectMs?: number[];
  /** The socket closes this long after its last use (10000). */
  idleCloseMs?: number;
}

const REDISCOVER_EVERY_MS = 30000;
const FAILED_POLLS_BEFORE_OFF = 2;

interface Entry {
  deviceId: string;
  link: SamsungLink;
  host: string;
  linkHost: string;
  client: SamsungClient | undefined;
  connecting: Promise<SamsungClient> | undefined;
  observers: Set<(r: Reported) => void>;
  state: TvState | undefined;
  lastJson: string | undefined;
  /** Bumped whenever polling stops, so a poll in flight is ignored. */
  pollGen: number;
  polling: boolean;
  pollTimer: ReturnType<typeof setTimeout> | undefined;
  failedPolls: number;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  attemptToken: number;
  attempt: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
  /** The TV asked us to pair again (revoked token, or an unanswered prompt): stay quiet until
   *  `clearNotPaired`, so a prompt is not made to appear on the TV again and again. */
  notPaired: boolean;
  /** The last connect met a certificate other than the pinned one. */
  pinMismatch: boolean;
  rediscovering: boolean;
  lastRediscoverAt: number | undefined;
  playPause: number;
}

function asDeviceError(e: unknown): DeviceError {
  if (e instanceof DeviceError && (e.code === 'notPaired' || e.code === 'notLocal')) return e;
  return new DeviceError('notSent', e instanceof Error ? e.message : String(e));
}

/** The `samsung` link driver: one wss socket per TV for keys, and the plain-HTTP info page for
 *  power state. */
export function createSamsungDriver(o: SamsungDriverOpts): LinkDriver & {
  kind: 'samsung';
  clearNotPaired(deviceId: string, link?: SamsungLink): void;
} {
  const t = o.transport;
  const connectMs = o.connectMs ?? 1500;
  const pollMs = o.pollMs ?? 5000;
  const backoff = o.reconnectMs ?? [250, 500, 1000, 2000, 5000];
  const idleCloseMs = o.idleCloseMs ?? 10000;
  const entries = new Map<string, Entry>();
  /** Rediscoveries run one at a time across all TVs. */
  let searchQueue: Promise<unknown> = Promise.resolve();

  // ---- entries ---------------------------------------------------------------------------------

  function entryFor(device: Device, link: SamsungLink): Entry {
    let e = entries.get(device.id);
    if (!e) {
      e = {
        deviceId: device.id,
        link,
        host: link.host,
        linkHost: link.host,
        client: undefined,
        connecting: undefined,
        observers: new Set(),
        state: undefined,
        lastJson: undefined,
        pollGen: 0,
        polling: false,
        pollTimer: undefined,
        failedPolls: 0,
        retryTimer: undefined,
        attemptToken: 0,
        attempt: 0,
        idleTimer: undefined,
        notPaired: false,
        pinMismatch: false,
        rediscovering: false,
        lastRediscoverAt: undefined,
        playPause: 0,
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

  function setPower(e: Entry, on: boolean): void {
    const wasOn = e.state?.power === true;
    e.state = { power: on };
    if (on && !wasOn) e.attempt = 0;
    const json = JSON.stringify(e.state);
    if (json === e.lastJson) return;
    e.lastJson = json;
    const report: Reported = { kind: 'tv', state: { ...e.state } };
    [...e.observers].forEach((cb) => cb(report));
  }

  // ---- connection ------------------------------------------------------------------------------

  async function doConnect(e: Entry, budgetMs: number): Promise<SamsungClient> {
    if (e.notPaired) throw new DeviceError('notPaired', 'The TV asked to pair again');
    const link = e.link;
    const token = await o.secrets.get(link.tokenRef);
    // `null` is unpaired; '' is a TV that sends no token.
    if (token === null) throw new DeviceError('notPaired', 'The TV is not paired');
    const started = Date.now();
    let client: SamsungClient;
    try {
      client = await SamsungClient.connect(
        t,
        { host: e.host, token, pinSha256: link.pinSha256 },
        budgetMs,
      );
    } catch (err) {
      // A certificate other than the pinned one: a renewed certificate, or another device at this
      // address. The failure handler searches once before saying "Pair again".
      if (err instanceof DeviceError && err.code === 'notPaired') e.pinMismatch = true;
      throw asDeviceError(err);
    }
    try {
      // Give up a little before the press budget, so the reason is known when the press ends.
      const issued = await client.ready(Math.max(1, budgetMs - (Date.now() - started) - 10));
      if (issued !== '' && issued !== token) {
        // The TV rotated its token: keep the new one.
        await o.secrets.set(link.tokenRef, issued).catch(() => undefined);
      }
    } catch (err) {
      client.close();
      if (err instanceof DeviceError && err.code === 'notPaired') {
        e.notPaired = true;
        throw new DeviceError('notPaired', 'The TV asked to pair again');
      }
      if (err instanceof DeviceError && err.code === 'timeout' && token !== '') {
        // A TV that knows the token answers at once. Silence after a stored token means it was
        // revoked and the TV is showing a new Allow prompt: stay quiet instead of prompting again.
        e.notPaired = true;
        throw new DeviceError('notPaired', 'The TV did not accept the stored token');
      }
      throw asDeviceError(err);
    }
    return client;
  }

  function connectOnce(e: Entry, budgetMs: number): Promise<SamsungClient> {
    if (e.client) return Promise.resolve(e.client);
    if (!e.connecting) {
      e.connecting = doConnect(e, budgetMs).then(
        (client) => {
          e.connecting = undefined;
          install(e, client);
          return client;
        },
        (err: unknown) => {
          e.connecting = undefined;
          if (e.pinMismatch) {
            e.pinMismatch = false;
            void onPinMismatch(e);
            // The search is still running: this press only failed to send. It is "Pair again"
            // only once the search is over, or when there was nothing to search by.
            if (!e.notPaired) throw new DeviceError('notSent', 'The TV is being searched for');
          }
          throw err;
        },
      );
    }
    return e.connecting;
  }

  function install(e: Entry, client: SamsungClient): void {
    e.client = client;
    e.attempt = 0;
    client.onClose(() => {
      if (e.client !== client) return;
      e.client = undefined;
      if (warmWanted(e)) {
        e.attempt = 0;
        scheduleBackoff(e);
      }
    });
    if (e.observers.size === 0) scheduleIdle(e);
  }

  /** The socket is kept warm while observed, the TV is on and it has not asked to pair again. */
  function warmWanted(e: Entry): boolean {
    return e.observers.size > 0 && e.state?.power === true && !e.notPaired;
  }

  function cancelAttempt(e: Entry): void {
    if (e.retryTimer) clearTimeout(e.retryTimer);
    e.retryTimer = undefined;
    e.attemptToken += 1;
  }

  function scheduleAttempt(e: Entry, delayMs: number): void {
    cancelAttempt(e);
    if (delayMs <= 0) {
      const token = e.attemptToken;
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

  /** The next step of the backoff; after the last one it stops, so a TV that keeps prompting is
   *  not spammed, until the next press, `clearNotPaired` or a new observer. */
  function scheduleBackoff(e: Entry): void {
    if (e.attempt >= backoff.length) return;
    const delay = backoff[e.attempt] ?? 5000;
    e.attempt += 1;
    scheduleAttempt(e, delay);
  }

  /** Starts a warm connection if one is wanted and none is under way. */
  function ensureWarm(e: Entry): void {
    if (!warmWanted(e) || e.client || e.connecting || e.retryTimer || e.rediscovering) return;
    if (e.attempt >= backoff.length) return;
    scheduleAttempt(e, 0);
  }

  async function runAttempt(e: Entry): Promise<void> {
    if (!warmWanted(e) || e.client || e.connecting) return;
    try {
      await connectOnce(e, connectMs);
    } catch (err) {
      if (e.notPaired || (err instanceof DeviceError && err.code === 'notLocal')) return;
      if (warmWanted(e)) scheduleBackoff(e);
    }
  }

  // ---- rediscovery -------------------------------------------------------------------------------

  /** One rediscovery at a time across TVs. Returns the new host, or null. */
  function search(e: Entry): Promise<string | null> {
    const job = async (): Promise<string | null> => {
      try {
        const token = await o.secrets.get(e.link.tokenRef);
        return await rediscoverSamsung(t, { ...e.link, host: e.host }, token ? { token } : {});
      } catch {
        return null;
      }
    };
    const run = searchQueue.then(job, job);
    searchQueue = run;
    return run;
  }

  /** Saves a new address even if nobody is watching any more. */
  async function adoptHost(e: Entry, host: string): Promise<void> {
    e.host = host;
    e.failedPolls = 0;
    try {
      await o.onHostChanged(e.deviceId, host);
    } catch {
      // The new host still works for this run; it is saved on the next change.
    }
  }

  async function onPinMismatch(e: Entry): Promise<void> {
    if (!e.link.mac) {
      // Nothing to search by: the pinned TV is gone from this address.
      e.notPaired = true;
      return;
    }
    if (e.rediscovering) return;
    e.rediscovering = true;
    e.lastRediscoverAt = Date.now();
    const host = await search(e);
    e.rediscovering = false;
    if (host !== null && host !== e.host) {
      await adoptHost(e, host);
      e.attempt = 0;
      ensureWarm(e);
      return;
    }
    // The pinned TV is nowhere else: its certificate changed, so it needs pairing again. The new
    // certificate is never trusted silently.
    e.notPaired = true;
  }

  async function onPollsFailed(e: Entry): Promise<void> {
    if (!e.link.mac || e.rediscovering) return;
    const now = Date.now();
    if (e.lastRediscoverAt !== undefined && now - e.lastRediscoverAt < REDISCOVER_EVERY_MS) return;
    e.rediscovering = true;
    e.lastRediscoverAt = now;
    const host = await search(e);
    e.rediscovering = false;
    if (host !== null && host !== e.host) {
      await adoptHost(e, host);
      e.attempt = 0;
      if (e.observers.size > 0) pollSoon(e);
    }
  }

  // ---- info-page poll ----------------------------------------------------------------------------

  function startPolling(e: Entry): void {
    if (e.polling) return;
    e.polling = true;
    const gen = e.pollGen;
    void Promise.resolve().then(() => {
      if (e.pollGen === gen) void pollOnce(e, gen);
    });
  }

  function stopPolling(e: Entry): void {
    e.polling = false;
    e.pollGen += 1;
    if (e.pollTimer) clearTimeout(e.pollTimer);
    e.pollTimer = undefined;
  }

  /** Polls now instead of at the next tick (the address just changed). */
  function pollSoon(e: Entry): void {
    if (!e.polling) return;
    if (e.pollTimer) clearTimeout(e.pollTimer);
    e.pollTimer = undefined;
    const gen = e.pollGen;
    void Promise.resolve().then(() => {
      if (e.pollGen === gen && !e.pollTimer) void pollOnce(e, gen);
    });
  }

  async function pollOnce(e: Entry, gen: number): Promise<void> {
    let power: 'on' | 'standby' | undefined;
    try {
      power = (await fetchInfo(t, e.host)).power;
    } catch {
      power = undefined;
    }
    if (e.pollGen !== gen) return;
    if (power !== undefined) {
      e.failedPolls = 0;
      if (power === 'on') {
        setPower(e, true);
        ensureWarm(e);
      } else {
        // In standby the info page answers but the socket is refused: report off, open nothing.
        setPower(e, false);
        cancelAttempt(e);
      }
    } else {
      e.failedPolls += 1;
      if (e.failedPolls >= FAILED_POLLS_BEFORE_OFF) {
        const c = e.client;
        e.client = undefined;
        cancelAttempt(e);
        c?.close();
        // Off the home Wi-Fi the phone cannot tell: say nothing.
        const onWifi = await t.onWifi().catch(() => false);
        if (e.pollGen !== gen) return;
        if (onWifi) setPower(e, false);
        void onPollsFailed(e);
      }
    }
    if (e.pollGen !== gen) return;
    e.pollTimer = setTimeout(() => {
      e.pollTimer = undefined;
      void pollOnce(e, gen);
    }, pollMs);
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

  /** Nothing is written once the hub has given up. */
  function refuseIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new DeviceError('notSent', 'The send was cancelled');
  }

  async function sendOverSocket(
    e: Entry,
    cmd: Extract<Command, { kind: 'tv.key' | 'tv.text' }>,
    signal?: AbortSignal,
  ): Promise<void> {
    // A press is a fresh start for the warm socket's backoff.
    if (!e.client) e.attempt = 0;
    const client = await withinBudget(connectMs, connectOnce(e, connectMs));
    refuseIfAborted(signal);
    if (cmd.kind === 'tv.text') {
      client.text(cmd.text);
      return;
    }
    if (cmd.key === 'playPause') {
      const name = PLAY_PAUSE_CYCLE[e.playPause % PLAY_PAUSE_CYCLE.length];
      if (name === undefined) return;
      client.key(name);
      e.playPause += 1;
      return;
    }
    client.key(KEY_NAME[cmd.key]);
  }

  // ---- LinkDriver ------------------------------------------------------------------------------

  return {
    kind: 'samsung',

    /** Call after a successful `pairSamsung` for this device, with its stored link (the host, token
     *  and pin may have changed): lets the driver connect again. */
    clearNotPaired(deviceId: string, link?: SamsungLink): void {
      const e = entries.get(deviceId);
      if (!e) return;
      if (link) {
        e.link = link;
        e.linkHost = link.host;
        e.host = link.host;
      }
      e.notPaired = false;
      e.pinMismatch = false;
      e.failedPolls = 0;
      e.attempt = 0;
      ensureWarm(e);
    },

    available: () => true,

    capabilities: (device: Device, link: Link): Capabilities => ({
      tv: {
        inputList: false,
        text: true,
        powerOn:
          (link.kind === 'samsung' && !!link.mac) || device.links.some((l) => l.kind === 'ir'),
      },
    }),

    supports(device: Device, link: Link, cmd: Command): boolean {
      if (link.kind !== 'samsung') return false;
      if (cmd.kind === 'tv.key' || cmd.kind === 'tv.text') return true;
      // With IR on the phone, power-on goes over IR, the reliable path.
      if (cmd.kind === 'tv.powerOn') {
        return !!link.mac && !device.links.some((l) => l.kind === 'ir');
      }
      return false;
    },

    async send(device: Device, link: Link, cmd: Command, signal?: AbortSignal): Promise<void> {
      if (link.kind !== 'samsung') throw new DeviceError('unsupported');
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
      if (e.idleTimer) {
        clearTimeout(e.idleTimer);
        e.idleTimer = undefined;
      }
      try {
        await sendOverSocket(e, cmd, signal);
      } finally {
        scheduleIdle(e);
      }
    },

    /** Drops the TV's connection and poll, then deletes its token. Idempotent; a failing delete is
     *  rethrown after the entry is gone. The pin lives on the link and needs no delete. */
    async forget(device: Device, link: Link): Promise<void> {
      if (link.kind !== 'samsung') return;
      const e = entries.get(device.id);
      if (e) {
        cancelAttempt(e);
        stopPolling(e);
        if (e.idleTimer) clearTimeout(e.idleTimer);
        e.idleTimer = undefined;
        e.observers.clear();
        const c = e.client;
        e.client = undefined;
        c?.close();
        entries.delete(device.id);
      }
      await o.secrets.delete(link.tokenRef);
    },

    observe(device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe {
      if (link.kind !== 'samsung') return () => undefined;
      const e = entryFor(device, link);
      e.observers.add(cb);
      if (e.idleTimer) {
        clearTimeout(e.idleTimer);
        e.idleTimer = undefined;
      }
      if (e.state) cb({ kind: 'tv', state: { ...e.state } });
      // A new observer starts the backoff afresh.
      e.attempt = 0;
      startPolling(e);
      ensureWarm(e);
      return () => {
        e.observers.delete(cb);
        if (e.observers.size > 0) return;
        cancelAttempt(e);
        stopPolling(e);
        e.failedPolls = 0;
        scheduleIdle(e);
      };
    },
  };
}
