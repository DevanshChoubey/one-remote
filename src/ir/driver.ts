import { DeviceError } from '@/core';
import type { Capabilities, Command, Device, FanSpeed, FanState, Link, LinkDriver } from '@/core';
import type { Catalogue, FanKey, Remote } from './catalogue';
import { defaultCatalogue } from './codes';
import type { IrEmitter, IrSignal } from './emitter';
import { fanKeys } from './fanKeys';

const DEFAULT_GAP_MS = 200;
const ALL_FAN_KEYS: ReadonlySet<FanKey> = new Set<FanKey>([
  'off',
  'speed1',
  'speed2',
  'speed3',
  'speed4',
  'speed5',
  'boost',
  'sleep',
  'light',
  'timer1',
  'timer2',
  'timer4',
  'timer8',
  'timerOff',
]);
const TV_KEYS = ['power', 'volumeUp', 'volumeDown', 'mute'] as const;

const SPEEDS: Record<string, FanSpeed> = {
  speed1: 1,
  speed2: 2,
  speed3: 3,
  speed4: 4,
  speed5: 5,
};
const TIMERS: Record<string, FanState['timerHours']> = {
  timerOff: 0,
  timer1: 1,
  timer2: 2,
  timer4: 4,
  timer8: 8,
};

/**
 * What we believe about a fan after `key` went out. Speed keys are absolute. Toggles flip only
 * from what we hold. After power off, or a speed key sent while off or unknown, the toggles are
 * taken as off (the usual state after power on, and how a physical remote behaves).
 */
function applyKey(m: FanState | undefined, key: FanKey): FanState | undefined {
  const on = m?.power === true;
  if (key === 'off') {
    return {
      power: false,
      speed: m?.speed ?? 1,
      boost: false,
      sleep: false,
      timerHours: 0,
    };
  }
  const speed = SPEEDS[key];
  if (speed !== undefined) {
    return on && m
      ? { ...m, speed }
      : { power: true, speed, boost: false, sleep: false, timerHours: 0 };
  }
  if (!m || !on) return m;
  const timer = TIMERS[key];
  if (timer !== undefined) return { ...m, timerHours: timer };
  if (key === 'boost') return { ...m, boost: !m.boost };
  if (key === 'sleep') return { ...m, sleep: !m.sleep };
  if (key === 'light') return { ...m, light: !(m.light ?? false) };
  return m;
}

const wait = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * The `ir` link. One press is one transmit and nothing is ever resent here: the hub decides about
 * fallbacks. The driver keeps no live state (no `observe`); the hub keeps what was last sent. It
 * remembers what each fan actually reached, key by key, only so it can tell which toggle keys
 * changed. An unknown toggle is taken as off; if that guess is wrong the user presses again.
 *
 * Sends are serialised with one chain, because the emitter is one piece of hardware shared by
 * every device. A fan command with several keys is spaced `gapMs` apart, so a long sequence (five
 * keys is already 800 ms of gaps plus the transmits) can outlast the hub's 2000 ms timeout. The hub
 * then reports a timeout while the keys keep going out; it never resends non-idempotent
 * commands, and the driver's memory still follows the keys that really went out.
 *
 * If some keys went out and a later one failed, the error is `partiallySent` (terminal: the hub
 * must not fall back and resend). `notSent` is used only when nothing transmitted.
 */
export function createIrDriver(o: {
  emitter: IrEmitter;
  catalogue?: Catalogue;
  gapMs?: number;
}): LinkDriver & { kind: 'ir'; seedFan(deviceId: string, state: FanState): void } {
  const catalogue = o.catalogue ?? defaultCatalogue;
  const gapMs = o.gapMs ?? DEFAULT_GAP_MS;
  const lastFan = new Map<string, FanState>();
  let chain: Promise<unknown> = Promise.resolve();

  const remoteOf = (link: Link): Remote | undefined =>
    link.kind === 'ir' ? catalogue.remote(link.remoteId) : undefined;

  const transmit = async (s: IrSignal): Promise<void> => {
    try {
      await o.emitter.transmit(s);
    } catch (e) {
      throw e instanceof DeviceError ? e : new DeviceError('notSent');
    }
  };

  const unsupported = (): never => {
    throw new DeviceError('unsupported');
  };

  const sendNow = async (device: Device, link: Link, cmd: Command): Promise<void> => {
    if (!o.emitter.hasEmitter()) throw new DeviceError('noIrEmitter');
    const r = remoteOf(link);
    if (!r) return unsupported();
    if (cmd.kind === 'ac.set' && r.kind === 'ac') return transmit(r.encode(cmd.state));
    if (cmd.kind === 'fan.set' && r.kind === 'fan') {
      // Work out every key the change needs, then refuse before sending anything if the remote
      // lacks one: a press must never succeed while doing nothing, or be half-sent.
      const todo = fanKeys(lastFan.get(device.id), cmd.state, ALL_FAN_KEYS);
      const signals: IrSignal[] = [];
      for (const key of todo) {
        const signal = r.keys[key];
        if (!signal) return unsupported();
        signals.push(signal);
      }
      if (signals.length === 0) return;
      let mem = lastFan.get(device.id);
      for (const [i, key] of todo.entries()) {
        try {
          if (i > 0) await wait(gapMs);
          await transmit(signals[i] as IrSignal);
        } catch (e) {
          if (i === 0) throw e;
          throw new DeviceError('partiallySent');
        }
        mem = applyKey(mem, key);
        if (mem) lastFan.set(device.id, mem);
      }
      return;
    }
    if (r.kind === 'tv') {
      const signal =
        cmd.kind === 'tv.powerOn'
          ? r.keys.powerOn
          : cmd.kind === 'tv.key' && TV_KEYS.some((k) => k === cmd.key)
            ? r.keys[cmd.key]
            : undefined;
      if (signal) return transmit(signal);
    }
    return unsupported();
  };

  return {
    kind: 'ir',
    available: () => o.emitter.hasEmitter(),
    supports(_device: Device, link: Link, cmd: Command): boolean {
      const r = remoteOf(link);
      if (!r) return false;
      switch (cmd.kind) {
        case 'ac.set':
          return r.kind === 'ac';
        case 'fan.set':
          return r.kind === 'fan';
        case 'tv.powerOn':
          return r.kind === 'tv' && r.keys.powerOn !== undefined;
        case 'tv.key':
          return (
            r.kind === 'tv' && TV_KEYS.some((k) => k === cmd.key) && r.keys[cmd.key] !== undefined
          );
        default:
          return false;
      }
    },
    capabilities(_device: Device, link: Link): Capabilities {
      const r = remoteOf(link);
      return r && r.kind !== 'tv' ? r.caps : {};
    },
    seedFan(deviceId: string, state: FanState): void {
      lastFan.set(deviceId, state);
    },
    send(device: Device, link: Link, cmd: Command): Promise<void> {
      const run = chain.then(() => sendNow(device, link, cmd));
      chain = run.catch(() => undefined);
      return run;
    },
  };
}
