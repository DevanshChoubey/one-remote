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
import { magicPacket } from '@/tv/wol';
import { PAIR_PORT, type AtvTransport } from './constants';
import { KEYCODE } from './keys';
import { AtvRemote, type AtvLive } from './remote';
import { findAndroidTvByPin } from './rediscover';

type AndroidTvLink = Extract<TvLink, { kind: 'androidtv' }>;

export interface AndroidTvDriverOpts {
  transport: AtvTransport;
  /** The stored devices, read when forgetting (is the shared identity still used?). */
  devices(): Promise<Device[]>;
  /** Called once when the TV was found again at a new address (same certificate). */
  onHostChanged(deviceId: string, host: string): Promise<void>;
  /** Budget for a press to reach the TV, or be rejected `notSent` (1500). */
  connectMs?: number;
  /** Waits between reconnects (250, 500, 1000, 2000, 5000). */
  reconnectMs?: number[];
  /** The connection closes this long after its last use (10000). */
  idleCloseMs?: number;
  /** A TV silent for this long is considered gone (16000). */
  silentMs?: number;
}

const OFF_AFTER_MS = 3000;
const REDISCOVER_EVERY_MS = 30000;

interface Entry {
  deviceId: string;
  link: AndroidTvLink;
  host: string;
  linkHost: string;
  remote: AtvRemote | undefined;
  connecting: Promise<AtvRemote> | undefined;
  liveUnsub: Unsubscribe | undefined;
  observers: Set<(r: Reported) => void>;
  state: TvState | undefined;
  lastJson: string | undefined;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  attemptToken: number;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
  attempt: number;
  rediscovering: boolean;
  lastRediscoverAt: number | undefined;
  offTimer: ReturnType<typeof setTimeout> | undefined;
  /** The TV is up but no longer trusts this phone: stay quiet until `clearNotPaired`. */
  notPaired: boolean;
  /** The last connect met another certificate than the pinned one. */
  pinMismatch: boolean;
}

function asDeviceError(e: unknown): DeviceError {
  if (e instanceof DeviceError && (e.code === 'notPaired' || e.code === 'notLocal')) return e;
  return new DeviceError('notSent', e instanceof Error ? e.message : String(e));
}

/** The `androidtv` link driver: one remote session per TV, kept alive while the screen observes. */
export function createAndroidTvDriver(o: AndroidTvDriverOpts): LinkDriver & {
  kind: 'androidtv';
  clearNotPaired(deviceId: string, link?: AndroidTvLink): void;
} {
  const t = o.transport;
  const connectMs = o.connectMs ?? 1500;
  const backoff = o.reconnectMs ?? [250, 500, 1000, 2000, 5000];
  const idleCloseMs = o.idleCloseMs ?? 10000;
  const silentMs = o.silentMs ?? 16000;
  const entries = new Map<string, Entry>();
  /** Devices whose TV answered with `started: false` this run: standby still talks to us. */
  const answersWhenOff = new Set<string>();
  /** One rediscovery (and so one probe) at a time, across all TVs. */
  let probing = false;

  // ---- entries ---------------------------------------------------------------------------------

  function entryFor(device: Device, link: AndroidTvLink): Entry {
    let e = entries.get(device.id);
    if (!e) {
      e = {
        deviceId: device.id,
        link,
        host: link.host,
        linkHost: link.host,
        remote: undefined,
        connecting: undefined,
        liveUnsub: undefined,
        observers: new Set(),
        state: undefined,
        lastJson: undefined,
        retryTimer: undefined,
        attemptToken: 0,
        idleTimer: undefined,
        attempt: 0,
        rediscovering: false,
        lastRediscoverAt: undefined,
        offTimer: undefined,
        notPaired: false,
        pinMismatch: false,
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

  function publish(e: Entry, live: Readonly<AtvLive>): void {
    if (live.power === false) answersWhenOff.add(e.deviceId);
    const next: TvState = { power: live.power ?? true };
    if (live.volume !== undefined) next.volume = live.volume;
    if (live.muted !== undefined) next.muted = live.muted;
    if (live.app !== undefined) next.app = live.app;
    e.state = next;
    emit(e);
  }

  function clearOffTimer(e: Entry): void {
    if (e.offTimer) clearTimeout(e.offTimer);
    e.offTimer = undefined;
  }

  function emitOff(e: Entry): void {
    if (e.remote || e.observers.size === 0 || e.notPaired) return;
    e.state = { power: false };
    emit(e);
  }

  // ---- connection ------------------------------------------------------------------------------

  async function doConnect(e: Entry): Promise<AtvRemote> {
    if (e.notPaired) throw new DeviceError('notPaired', 'The TV no longer trusts this phone');
    const link = e.link;
    const host = e.host;
    try {
      return await AtvRemote.connect(
        t,
        { host, certRef: link.certRef, pinSha256: link.pinSha256 },
        connectMs,
        { silentMs },
      );
    } catch (err) {
      const de = asDeviceError(err);
      if (de.code === 'notPaired') {
        // Another certificate than the pinned one: the TV moved, or something else took its
        // address. The failure handler searches by pin before saying "pair again".
        e.pinMismatch = true;
        throw de;
      }
      if (de.code === 'notSent') {
        // If the pairing port still answers TLS to this phone, the TV is up and has forgotten us.
        const up = await t
          .openStream(host, PAIR_PORT, connectMs, { pairing: true, identity: link.certRef })
          .then(
            (s) => {
              s.close();
              return true;
            },
            () => false,
          );
        if (up) {
          e.notPaired = true;
          throw new DeviceError('notPaired', 'The TV no longer trusts this phone');
        }
      }
      throw de;
    }
  }

  function connectOnce(e: Entry): Promise<AtvRemote> {
    if (e.remote) return Promise.resolve(e.remote);
    if (!e.connecting) {
      e.connecting = doConnect(e).then(
        (remote) => {
          e.connecting = undefined;
          install(e, remote);
          return remote;
        },
        (err: unknown) => {
          e.connecting = undefined;
          throw err;
        },
      );
    }
    return e.connecting;
  }

  function install(e: Entry, remote: AtvRemote): void {
    e.remote = remote;
    e.attempt = 0;
    e.lastRediscoverAt = undefined;
    clearOffTimer(e);
    e.liveUnsub = remote.onLive((live) => publish(e, live));
    publish(e, remote.live);
    remote.onClose(() => onRemoteClosed(e, remote));
    if (e.observers.size === 0) scheduleIdle(e);
  }

  function dropRemote(e: Entry): void {
    e.liveUnsub?.();
    e.liveUnsub = undefined;
    e.remote = undefined;
  }

  function onRemoteClosed(e: Entry, remote: AtvRemote): void {
    if (e.remote !== remote) return;
    dropRemote(e);
    if (e.observers.size > 0) {
      e.attempt = 1;
      scheduleAttempt(e, backoff[0] ?? 250);
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
    if (e.observers.size === 0 || e.remote || e.rediscovering || e.notPaired) return;
    try {
      await connectOnce(e);
    } catch {
      await onConnectFailed(e);
    }
  }

  /** Searches by pin. Returns true when the TV was found at another address (saved, and the
   *  caller reconnects at once). */
  async function searchByPin(e: Entry): Promise<'moved' | 'same' | 'none'> {
    e.rediscovering = true;
    probing = true;
    e.lastRediscoverAt = Date.now();
    let host: string | null = null;
    try {
      host = await findAndroidTvByPin(t, { ...e.link, host: e.host });
    } catch {
      host = null;
    }
    probing = false;
    e.rediscovering = false;
    if (host === null) return 'none';
    if (host === e.host) return 'same';
    e.host = host;
    try {
      await o.onHostChanged(e.deviceId, host);
    } catch {
      // The new host still works for this run; it is saved on the next change.
    }
    return 'moved';
  }

  async function onConnectFailed(e: Entry): Promise<void> {
    if (e.observers.size === 0 || e.notPaired) return;
    const mismatch = e.pinMismatch;
    e.pinMismatch = false;
    const onWifi = await t.onWifi().catch(() => false);
    if (!onWifi) {
      // Off the home Wi-Fi: say nothing, keep trying.
      scheduleBackoff(e);
      return;
    }
    if (!mismatch && !e.offTimer && e.state?.power !== false) {
      e.offTimer = setTimeout(() => {
        e.offTimer = undefined;
        emitOff(e);
      }, OFF_AFTER_MS);
    }
    const throttled =
      e.lastRediscoverAt !== undefined && Date.now() - e.lastRediscoverAt < REDISCOVER_EVERY_MS;
    if ((throttled && !mismatch) || probing) {
      scheduleBackoff(e);
      return;
    }
    const result = await searchByPin(e);
    if (e.observers.size === 0) return;
    if (result === 'moved') {
      scheduleAttempt(e, 0);
      return;
    }
    if (mismatch && result === 'none') {
      // The pinned TV is nowhere on the network: it needs pairing again.
      e.notPaired = true;
      clearOffTimer(e);
      return;
    }
    scheduleBackoff(e);
  }

  // ---- idle close --------------------------------------------------------------------------------

  function scheduleIdle(e: Entry): void {
    if (e.observers.size > 0) return;
    if (e.idleTimer) clearTimeout(e.idleTimer);
    e.idleTimer = setTimeout(() => {
      e.idleTimer = undefined;
      if (e.observers.size > 0) return;
      const r = e.remote;
      dropRemote(e);
      r?.close();
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

  async function powerOn(e: Entry, link: AndroidTvLink, signal?: AbortSignal): Promise<void> {
    let remote: AtvRemote | undefined;
    try {
      remote = await withinBudget(connectMs, connectOnce(e));
    } catch (err) {
      const de = asDeviceError(err);
      if (de.code !== 'notSent') throw de;
    }
    refuseIfAborted(signal);
    if (remote) {
      // Power is a toggle: only press it when the TV says it is off.
      if (remote.live.power === false) remote.key(KEYCODE.power);
      return;
    }
    if (!link.mac) throw new DeviceError('notSent', 'The TV did not answer and has no MAC address');
    try {
      await t.sendWol(magicPacket(link.mac));
    } catch (err) {
      throw asDeviceError(err);
    }
  }

  // ---- LinkDriver ------------------------------------------------------------------------------

  const hasIr = (device: Device): boolean => device.links.some((l) => l.kind === 'ir');

  return {
    kind: 'androidtv',
    /** Call after a successful pairing for this device, with its stored link: lets the driver
     *  connect again. */
    clearNotPaired(deviceId: string, link?: AndroidTvLink): void {
      const e = entries.get(deviceId);
      if (!e) return;
      if (link) {
        e.link = link;
        e.linkHost = link.host;
        e.host = link.host;
      }
      e.notPaired = false;
      e.pinMismatch = false;
      e.attempt = 0;
      if (e.observers.size > 0 && !e.remote) scheduleAttempt(e, 0);
    },
    available: () => true,
    capabilities: (device: Device, link: Link): Capabilities => ({
      tv: {
        inputList: false,
        text: true,
        powerOn:
          (link.kind === 'androidtv' && !!link.mac) ||
          hasIr(device) ||
          answersWhenOff.has(device.id),
      },
    }),

    supports(device: Device, link: Link, cmd: Command): boolean {
      if (link.kind !== 'androidtv') return false;
      if (cmd.kind === 'tv.key' || cmd.kind === 'tv.text') return true;
      // With IR on the phone, power-on goes over IR, the reliable path.
      if (cmd.kind === 'tv.powerOn') {
        return !hasIr(device) && (!!link.mac || answersWhenOff.has(device.id));
      }
      return false;
    },

    async send(device: Device, link: Link, cmd: Command, signal?: AbortSignal): Promise<void> {
      if (link.kind !== 'androidtv') throw new DeviceError('unsupported');
      if (cmd.kind !== 'tv.key' && cmd.kind !== 'tv.text' && cmd.kind !== 'tv.powerOn') {
        throw new DeviceError('unsupported');
      }
      refuseIfAborted(signal);
      const e = entryFor(device, link);
      if (e.notPaired) throw new DeviceError('notPaired', 'The TV no longer trusts this phone');
      try {
        if (cmd.kind === 'tv.powerOn') {
          await powerOn(e, link, signal);
          return;
        }
        const remote = await withinBudget(connectMs, connectOnce(e));
        refuseIfAborted(signal);
        if (cmd.kind === 'tv.text') remote.text(cmd.text);
        else remote.key(KEYCODE[cmd.key]);
      } finally {
        scheduleIdle(e);
      }
    },

    /** Drops this TV's connection, and deletes the phone's shared identity when no other Android
     *  TV uses it. Idempotent; a failure is rethrown. */
    async forget(device: Device, link: Link): Promise<void> {
      if (link.kind !== 'androidtv') return;
      const e = entries.get(device.id);
      if (e) {
        cancelAttempt(e);
        clearOffTimer(e);
        if (e.idleTimer) clearTimeout(e.idleTimer);
        e.idleTimer = undefined;
        e.observers.clear();
        const r = e.remote;
        dropRemote(e);
        r?.close();
        entries.delete(device.id);
      }
      answersWhenOff.delete(device.id);
      const stillUsed = (await o.devices()).some(
        (d) =>
          d.id !== device.id &&
          d.links.some((l) => l.kind === 'androidtv' && l.certRef === link.certRef),
      );
      if (!stillUsed) await t.deleteIdentity(link.certRef);
    },

    observe(device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe {
      if (link.kind !== 'androidtv') return () => undefined;
      const e = entryFor(device, link);
      e.observers.add(cb);
      if (e.idleTimer) {
        clearTimeout(e.idleTimer);
        e.idleTimer = undefined;
      }
      if (e.state) cb({ kind: 'tv', state: { ...e.state } });
      if (!e.remote && !e.retryTimer && !e.rediscovering && !e.connecting && !e.notPaired) {
        e.attempt = 0;
        scheduleAttempt(e, 0);
      }
      return () => {
        e.observers.delete(cb);
        if (e.observers.size > 0) return;
        cancelAttempt(e);
        clearOffTimer(e);
        scheduleIdle(e);
      };
    },
  };
}
