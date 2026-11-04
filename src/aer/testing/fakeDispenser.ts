// From aer-remote src/ble/testing/fakeDispenser.ts (2026-11-04). Adapted: imports moved to @/aer/protocol and @/transport/ble; added the refuses option (connect rejects with AerError busy).
import { AerError } from '@/aer/errors';
import {
  decodeFirst,
  encodeMap,
  type CborEntry,
  type CborMap,
  type CborValue,
} from '@/aer/protocol/cbor';
import { MT } from '@/aer/protocol/messages';
import { toReply } from '@/aer/protocol/replies';
import { charUuid, DEFAULT_CHANNELS } from '@/aer/protocol/uuids';
import {
  decodeScheduleEntry,
  encodeScheduleEntry,
  type Interval,
  type Schedule,
} from '@/aer/protocol/schedule';
import type {
  AdapterState,
  BleCharacteristic,
  BleConnection,
  BleTransport,
  FoundDevice,
} from '@/transport/ble/transport';

export interface FakeDispenserOptions {
  /** Characteristic that accepts command messages. Defaults to ...0003. */
  commandChar?: string;
  /** connect() rejects. */
  busy?: boolean;
  /** connect() rejects with AerError busy, as when another phone holds the link. */
  refuses?: boolean;
  batteryMv?: number;
  /** Delay before each reply is delivered (default 0: next microtask). */
  replyDelayMs?: number;
  /** Every reply is delivered as 2 notifications. */
  splitReplies?: boolean;
  /** Writes are applied but no reply is ever sent. */
  dropReplies?: boolean;
  /** Before each reply, send a stale reply carrying mN - 1. */
  lateReplyFromPrevious?: boolean;
  /** The nth write (counted per device, fires once) is applied, gets no reply, and the link drops. */
  disconnectAfter?: number;
  /** Extra writable characteristics (e.g. an OTA char). Writes are recorded but never answered. */
  extraWritable?: string[];
  /** fetch-status replies omit bV, so they cannot be parsed. */
  omitBv?: boolean;
  /** The schedule characteristic (...0004) is not writable. */
  scheduleReadOnly?: boolean;
  /** Set-schedules messages are acknowledged but not applied. */
  ignoreScheduleWrites?: boolean;
  /**
   * A schedule window with this interval is running: status reports `cS` 12x, and auto-spray
   * requests are acknowledged but not applied, as on firmware 3.0.8-IN.
   */
  scheduleWindow?: Interval;
  /** Auto-spray requests are acknowledged but not applied. */
  ignoreAutoSpray?: boolean;
}

export interface FakeDispenserState {
  schedules: Schedule[];
  autoSpray: Interval | null;
  spraysSinceRefill: number;
  time?: number;
  /** The tZ (minutes west of UTC, standard time) of the last set-time message. */
  tz?: number;
  ledBlinks: number;
  /** Retrieve-schedules replies carry an entry that cannot be decoded. */
  badScheduleReply?: boolean;
  writes: { char: string; mT: number }[];
}

export type FakeTransport = BleTransport & {
  state(id: string): FakeDispenserState;
  /** Drop the device's live link from the device side, firing onDisconnect. */
  disconnect(id: string): void;
};

const REPLY_OFFSET = 50;
const AUTO_SPRAY_CODE: Record<Interval, number> = { 10: 112, 20: 113, 40: 114 };
const NO_AUTO_SPRAY_CODE = 111;
const SCHEDULE_WINDOW_CODE: Record<Interval, number> = { 10: 121, 20: 122, 40: 123 };
const DEFAULT_BATTERY_MV = 3000;
const FIRMWARE = '1.0.0';

const isMap = (v: CborValue | undefined): v is CborMap =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Uint8Array);

const isInterval = (n: unknown): n is Interval => n === 10 || n === 20 || n === 40;

const numberOf = (v: CborValue | undefined): number | undefined =>
  typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : undefined;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const nextTick = (): Promise<void> => Promise.resolve();

interface Device {
  options: FakeDispenserOptions;
  state: FakeDispenserState;
  writeCount: number;
  drop: (() => void) | null;
}

function bytesOf(v: CborValue | undefined): Uint8Array | null {
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'number'))
    return Uint8Array.from(v as number[]);
  return null;
}

function statusCode(state: FakeDispenserState, options: FakeDispenserOptions): number {
  if (options.scheduleWindow) return SCHEDULE_WINDOW_CODE[options.scheduleWindow];
  return state.autoSpray ? AUTO_SPRAY_CODE[state.autoSpray] : NO_AUTO_SPRAY_CODE;
}

/** Apply a decoded request to the device state; returns the extra reply fields. */
function apply(device: Device, mT: number, body: CborMap): CborEntry[] | null {
  const { state, options } = device;
  switch (mT) {
    case MT.setTime: {
      const eP = numberOf(body.eP);
      if (eP !== undefined) state.time = eP;
      const tZ = numberOf(body.tZ);
      if (tZ !== undefined) state.tz = tZ;
      return [];
    }
    case MT.setSchedules: {
      if (options.ignoreScheduleWrites) return [];
      const list = body.S;
      const next: Schedule[] = [];
      if (Array.isArray(list)) {
        for (const item of list) {
          const bytes = isMap(item) ? bytesOf(item.s) : null;
          if (bytes) next.push(decodeScheduleEntry(bytes));
        }
      }
      state.schedules = next;
      return [];
    }
    case MT.sprayNow: {
      state.spraysSinceRefill += 1;
      const autoAllowed = !options.scheduleWindow && !options.ignoreAutoSpray;
      if (isInterval(body.rI) && autoAllowed) state.autoSpray = body.rI;
      return [];
    }
    case MT.refill:
      state.spraysSinceRefill = 0;
      return [];
    case MT.stop:
      if (body.sS === true) state.autoSpray = null;
      return [];
    case MT.fetchStatus:
      return [
        ...(options.omitBv
          ? []
          : ([['bV', options.batteryMv ?? DEFAULT_BATTERY_MV]] as CborEntry[])),
        ['fV', FIRMWARE],
        ['cS', statusCode(state, options)],
        ['sC', state.spraysSinceRefill],
      ];
    case MT.removeSchedules:
      state.schedules = [];
      return [];
    case MT.retrieveSchedules:
      if (state.badScheduleReply) return [['S', [{ s: new Uint8Array([1, 2, 3]) }]]];
      return [['S', state.schedules.map((s) => ({ s: encodeScheduleEntry(s) }))]];
    case MT.testLed:
      state.ledBlinks += 1;
      return [];
    default:
      return null;
  }
}

function createConnection(id: string, device: Device): BleConnection {
  const { options } = device;
  const commandChar = options.commandChar ?? DEFAULT_CHANNELS.command;
  const replyChar = DEFAULT_CHANNELS.reply;
  const scheduleChar = DEFAULT_CHANNELS.schedule;
  const subscribers = new Set<(b: Uint8Array) => void>();
  const disconnectCbs = new Set<() => void>();
  const pending = new Map<string, Uint8Array>();
  let connected = true;

  const dropRef = (): void => drop();
  device.drop = dropRef;
  const drop = (): void => {
    if (!connected) return;
    connected = false;
    if (device.drop === dropRef) device.drop = null;
    subscribers.clear();
    for (const cb of [...disconnectCbs]) cb();
  };

  const notify = (bytes: Uint8Array): void => {
    if (options.splitReplies && bytes.length > 1) {
      const cut = Math.ceil(bytes.length / 2);
      const chunks = [bytes.slice(0, cut), bytes.slice(cut)];
      for (const c of chunks) for (const cb of [...subscribers]) cb(c);
      return;
    }
    for (const cb of [...subscribers]) cb(bytes);
  };

  const encodeReply = (mT: number, mN: number, extra: CborEntry[]): Uint8Array =>
    encodeMap([['mT', mT + REPLY_OFFSET], ['mN', mN], ['ack', 200], ...extra]);

  const handleMessage = async (char: string, value: CborValue): Promise<void> => {
    const msg = toReply(value);
    if (!msg) return;
    device.state.writes.push({ char, mT: msg.mT });
    device.writeCount += 1;
    const accepted = msg.mT === MT.setSchedules ? char === scheduleChar : char === commandChar;
    let extra: CborEntry[] | null;
    try {
      extra = accepted ? apply(device, msg.mT, msg.body) : null;
    } catch {
      return;
    }
    if (device.writeCount === options.disconnectAfter) {
      await nextTick();
      drop();
      return;
    }
    if (extra === null || options.dropReplies) return;
    await nextTick();
    if (options.replyDelayMs) await delay(options.replyDelayMs);
    if (!connected) return;
    if (options.lateReplyFromPrevious) notify(encodeReply(msg.mT, msg.mN - 1, extra));
    notify(encodeReply(msg.mT, msg.mN, extra));
  };

  return {
    deviceId: id,
    async characteristics(): Promise<BleCharacteristic[]> {
      return [
        { uuid: replyChar, writable: false, notifiable: true },
        { uuid: charUuid('0002'), writable: true, notifiable: false },
        { uuid: charUuid('0003'), writable: true, notifiable: false },
        { uuid: scheduleChar, writable: !options.scheduleReadOnly, notifiable: false },
        ...(options.extraWritable ?? []).map((uuid) => ({
          uuid,
          writable: true,
          notifiable: false,
        })),
      ];
    },
    async write(char, bytes): Promise<void> {
      if (!connected) throw new Error('Not connected');
      if (
        char === replyChar ||
        ![
          commandChar,
          charUuid('0002'),
          charUuid('0003'),
          scheduleChar,
          ...(options.extraWritable ?? []),
        ].includes(char)
      )
        throw new Error('Characteristic is not writable');
      const prior = pending.get(char);
      let buf = bytes;
      if (prior) {
        buf = new Uint8Array(prior.length + bytes.length);
        buf.set(prior, 0);
        buf.set(bytes, prior.length);
      }
      for (;;) {
        let decoded: ReturnType<typeof decodeFirst>;
        try {
          decoded = decodeFirst(buf);
        } catch {
          pending.delete(char);
          return;
        }
        if (decoded === null) {
          pending.set(char, buf);
          return;
        }
        buf = buf.slice(decoded.length);
        void handleMessage(char, decoded.value).catch(() => undefined);
        if (buf.length === 0) {
          pending.delete(char);
          return;
        }
      }
    },
    async subscribe(char, onData): Promise<() => void> {
      if (!connected) throw new Error('Not connected');
      if (char !== replyChar) throw new Error('Characteristic cannot notify');
      subscribers.add(onData);
      return () => {
        subscribers.delete(onData);
      };
    },
    onDisconnect(cb): () => void {
      disconnectCbs.add(cb);
      return () => {
        disconnectCbs.delete(cb);
      };
    },
    async disconnect(): Promise<void> {
      drop();
    },
  };
}

export function createFakeTransport(
  devices: Record<string, FakeDispenserOptions>,
  transportOptions: { permissionsGranted?: boolean; adapterState?: AdapterState } = {},
): FakeTransport {
  const registry = new Map<string, Device>();
  for (const [id, options] of Object.entries(devices)) {
    registry.set(id, {
      options,
      state: { schedules: [], autoSpray: null, spraysSinceRefill: 0, ledBlinks: 0, writes: [] },
      writeCount: 0,
      drop: null,
    });
  }
  const lookup = (id: string): Device => {
    const device = registry.get(id);
    if (!device) throw new Error(`Unknown fake device ${id}`);
    return device;
  };

  return {
    async adapterState() {
      return transportOptions.adapterState ?? 'on';
    },
    async requestPermissions() {
      return transportOptions.permissionsGranted ?? true;
    },
    scan(onFound, timeoutMs) {
      void timeoutMs;
      let stopped = false;
      let finish: () => void = () => undefined;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      void nextTick().then(() => {
        for (const id of registry.keys()) {
          if (stopped) break;
          const found: FoundDevice = { id, name: 'Smart Matic', rssi: -60 };
          onFound(found);
        }
        finish();
      });
      return {
        stop() {
          stopped = true;
          finish();
        },
        done,
      };
    },
    async connect(deviceId) {
      const device = lookup(deviceId);
      if (device.options.refuses) throw new AerError('busy');
      if (device.options.busy || device.drop) throw new Error('Device is busy');
      return createConnection(deviceId, device);
    },
    state(id) {
      return lookup(id).state;
    },
    disconnect(id) {
      lookup(id).drop?.();
    },
  };
}
