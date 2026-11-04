// From aer-remote src/device/session.ts (2026-11-04). Adapted: imports moved to @/aer and @/transport/ble; DeviceError renamed AerError; connectWithRetries throws busy when every attempt was refused with busy.
import type { BleConnection, BleTransport } from '@/transport/ble/transport';
import { decodeFirst } from '@/aer/protocol/cbor';
import { fetchStatusMsg, setTimeMsg, type OutgoingMessage } from '@/aer/protocol/messages';
import { toReply, type Reply } from '@/aer/protocol/replies';
import { parseStatus, type DeviceStatus } from '@/aer/protocol/status';
import { charUuid, DEFAULT_CHANNELS, type Channels } from '@/aer/protocol/uuids';

import { AerError } from '@/aer/errors';
import { zoneInfo } from '@/aer/time';

export interface SessionOptions {
  /** How long to wait for a matching reply. Default 3000. */
  replyTimeoutMs?: number;
  /** How long each connect attempt may take. Default 8000. */
  connectTimeoutMs?: number;
  /** Connect attempts before giving up. Default 3 (backoff 500ms, then 1500ms). */
  connectAttempts?: number;
  /** Called when notifications on the reply channel fail after subscribing. Default: console.warn. */
  onSubscribeError?: (e: Error) => void;
  now?: () => Date;
  mN?: () => number;
}

export interface OpenedSession {
  session: DispenserSession;
  channels: Channels;
  status: DeviceStatus;
  /** True when the device acknowledged a set-time message. */
  clockSet: boolean;
}

const DEFAULT_REPLY_TIMEOUT_MS = 3000;
const DEFAULT_CONNECT_TIMEOUT_MS = 8000;
const DEFAULT_CONNECT_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];
const REPLY_OFFSET = 50;
const ACK_OK = 200;
/** A reply frame is a few dozen bytes; anything larger without a complete item is garbage. */
const MAX_REPLY_BUFFER = 1024;
const PROBE_CHARS: string[] = [charUuid('0002'), charUuid('0003'), charUuid('0004')];
const MN_MIN = 100;
const MN_MAX = 253;

interface Pending {
  mT: number;
  mN: number;
  resolve: (r: Reply) => void;
  reject: (e: AerError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

export class DispenserSession {
  private channels: Channels;
  private alive = true;
  private pending: Pending | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private tail: Promise<unknown> = Promise.resolve();
  private counter = MN_MIN - 1;
  private readonly disconnectCbs = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private offDisconnect: (() => void) | null = null;
  private readonly replyTimeoutMs: number;

  private constructor(
    private readonly conn: BleConnection,
    channels: Channels,
    private readonly opts: SessionOptions = {},
  ) {
    this.channels = channels;
    this.replyTimeoutMs = opts.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
  }

  get connected(): boolean {
    return this.alive;
  }

  /** Wrap a live connection: subscribes to replies and watches the link. */
  static async attach(
    conn: BleConnection,
    channels: Channels,
    opts: SessionOptions = {},
  ): Promise<DispenserSession> {
    const session = new DispenserSession(conn, channels, opts);
    await session.start();
    return session;
  }

  private async start(): Promise<void> {
    this.offDisconnect = this.conn.onDisconnect(() => this.handleDrop());
    try {
      this.unsubscribe = await this.conn.subscribe(
        this.channels.reply,
        (b) => this.onData(b),
        this.opts.onSubscribeError ?? ((e) => console.warn('reply notifications failed', e)),
      );
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }

  /** Next message number, cycling 100-253. */
  nextMN(): number {
    if (this.opts.mN) return this.opts.mN();
    this.counter = this.counter >= MN_MAX ? MN_MIN : this.counter + 1;
    return this.counter;
  }

  /** Switch which characteristics commands and schedules are written to. */
  useChannels(channels: Channels): void {
    this.channels = channels;
  }

  send(msg: OutgoingMessage): Promise<Reply> {
    const run = this.tail.then(() => this.exchange(msg));
    this.tail = run.catch(() => undefined);
    return run;
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectCbs.add(cb);
    return () => {
      this.disconnectCbs.delete(cb);
    };
  }

  /** Deliberate disconnect. Does not fire onDisconnect callbacks. Safe to call twice. */
  async close(): Promise<void> {
    if (!this.alive) return;
    this.alive = false;
    this.cleanup();
    this.failPending(new AerError('disconnected'));
    try {
      await this.conn.disconnect();
    } catch {
      // Already gone; nothing to release.
    }
  }

  private exchange(msg: OutgoingMessage): Promise<Reply> {
    if (!this.alive) return Promise.reject(new AerError('disconnected'));
    const char = msg.channel === 'schedule' ? this.channels.schedule : this.channels.command;
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.timer === timer) this.pending = null;
        this.buffer = new Uint8Array(0);
        reject(new AerError('noReply'));
      }, this.replyTimeoutMs);
      this.pending = { mT: msg.mT, mN: msg.mN, resolve, reject, timer };
      this.buffer = new Uint8Array(0);
      this.conn.write(char, msg.bytes).catch(() => {
        if (this.pending?.timer !== timer) return;
        clearTimeout(timer);
        this.pending = null;
        reject(new AerError(this.alive ? 'noReply' : 'disconnected'));
      });
    });
  }

  private onData(chunk: Uint8Array): void {
    let buf = concat(this.buffer, chunk);
    for (;;) {
      if (buf.length === 0) break;
      let item: ReturnType<typeof decodeFirst>;
      try {
        item = decodeFirst(buf);
      } catch {
        // Corrupt frame: drop it so the session cannot stall, and never throw into the transport.
        buf = new Uint8Array(0);
        break;
      }
      if (item === null) {
        if (buf.length > MAX_REPLY_BUFFER) buf = new Uint8Array(0);
        break;
      }
      buf = buf.slice(item.length);
      const reply = toReply(item.value);
      if (reply) this.deliver(reply);
    }
    this.buffer = buf;
  }

  private deliver(reply: Reply): void {
    const p = this.pending;
    if (!p || reply.mT !== p.mT + REPLY_OFFSET || reply.mN !== p.mN) return;
    this.pending = null;
    clearTimeout(p.timer);
    if (reply.ack !== ACK_OK) p.reject(new AerError('rejected', `ack ${reply.ack}`));
    else p.resolve(reply);
  }

  private failPending(e: AerError): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.reject(e);
  }

  private cleanup(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.offDisconnect?.();
    this.offDisconnect = null;
  }

  private handleDrop(): void {
    if (!this.alive) return;
    this.alive = false;
    this.cleanup();
    this.failPending(new AerError('disconnected'));
    const cbs = [...this.disconnectCbs];
    this.disconnectCbs.clear();
    for (const cb of cbs) {
      try {
        cb();
      } catch {
        // One failing listener must not stop the others.
      }
    }
  }
}

/** Asks for the Bluetooth permissions, then checks the radio; throws the matching AerError. */
export async function checkAdapter(t: BleTransport): Promise<void> {
  // adapterState() never prompts, so ask here; the OS skips the dialog once granted.
  let granted: boolean;
  try {
    granted = await t.requestPermissions();
  } catch {
    throw new AerError('permissionDenied', 'permission request failed');
  }
  if (!granted) throw new AerError('permissionDenied');
  const state = await t.adapterState();
  if (state === 'off' || state === 'unsupported') throw new AerError('bluetoothOff');
  if (state === 'unauthorized') throw new AerError('permissionDenied');
}

async function connectWithRetries(
  t: BleTransport,
  deviceId: string,
  opts: SessionOptions,
): Promise<BleConnection> {
  const attempts = opts.connectAttempts ?? DEFAULT_CONNECT_ATTEMPTS;
  const timeout = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  let refused = 0;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await t.connect(deviceId, timeout);
    } catch (e) {
      if (e instanceof AerError && e.code === 'busy') refused += 1;
      if (i < attempts - 1) await sleep(BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)] ?? 0);
    }
  }
  throw new AerError(attempts > 0 && refused === attempts ? 'busy' : 'unreachable');
}

async function fetchStatus(session: DispenserSession): Promise<DeviceStatus> {
  const reply = await session.send(fetchStatusMsg(session.nextMN()));
  try {
    return parseStatus(reply);
  } catch {
    throw new AerError('noReply', 'unreadable status reply');
  }
}

const isNoReply = (e: unknown): boolean => e instanceof AerError && e.code === 'noReply';

/** Send set-time; true when acknowledged, false on silence. Other failures propagate. */
async function trySetClock(
  session: DispenserSession,
  homeTimeZone: string,
  now: () => Date,
): Promise<boolean> {
  try {
    await setClock(session, homeTimeZone, now);
    return true;
  } catch (e) {
    if (!isNoReply(e)) throw e;
    return false;
  }
}

async function setClock(
  session: DispenserSession,
  homeTimeZone: string,
  now: () => Date,
): Promise<void> {
  const at = now();
  const msg = setTimeMsg(
    session.nextMN(),
    Math.floor(at.getTime() / 1000),
    zoneInfo(homeTimeZone, at),
  );
  await session.send(msg);
}

/** Try each other writable characteristic until one answers fetch-status. */
async function probe(
  session: DispenserSession,
  conn: BleConnection,
  current: Channels,
): Promise<{ channels: Channels; status: DeviceStatus }> {
  const chars = await conn.characteristics();
  const writable = new Set(chars.filter((c) => c.writable).map((c) => c.uuid));
  // Only aer's own characteristics are ever probed; never the OTA or any other GATT char.
  for (const c of chars) {
    if (!c.writable || !PROBE_CHARS.includes(c.uuid) || c.uuid === current.command) continue;
    const candidate: Channels = {
      ...current,
      command: c.uuid,
      schedule: writable.has(current.schedule) ? current.schedule : c.uuid,
    };
    session.useChannels(candidate);
    try {
      return { channels: candidate, status: await fetchStatus(session) };
    } catch (e) {
      if (!isNoReply(e)) throw e;
    }
  }
  session.useChannels(current);
  throw new AerError('noReply');
}

function assertValidZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new AerError('timeZone', `invalid time zone: ${timeZone}`);
  }
}

export async function openSession(
  t: BleTransport,
  deviceId: string,
  homeTimeZone: string,
  known: Channels | undefined,
  opts: SessionOptions = {},
): Promise<OpenedSession> {
  assertValidZone(homeTimeZone);
  await checkAdapter(t);
  const now = opts.now ?? ((): Date => new Date());
  const conn = await connectWithRetries(t, deviceId, opts);
  let channels = known ?? DEFAULT_CHANNELS;
  let session: DispenserSession | null = null;
  try {
    session = await DispenserSession.attach(conn, channels, opts);
    let clockSet = await trySetClock(session, homeTimeZone, now);
    let status: DeviceStatus;
    let probed = false;
    try {
      status = await fetchStatus(session);
    } catch (e) {
      if (!isNoReply(e)) throw e;
      const found = await probe(session, conn, channels);
      channels = found.channels;
      status = found.status;
      probed = true;
    }
    if (probed || !clockSet) clockSet = await trySetClock(session, homeTimeZone, now);
    return { session, channels, status, clockSet };
  } catch (e) {
    if (session) await session.close();
    else await conn.disconnect().catch(() => undefined);
    throw e instanceof AerError ? e : new AerError('unreachable');
  }
}
