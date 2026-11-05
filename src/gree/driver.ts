import { DeviceError, defaultAcState } from '@/core';
import type {
  AcState,
  Capabilities,
  Command,
  Device,
  Link,
  LinkDriver,
  Reported,
  Unsubscribe,
} from '@/core';
import type { GreeClient, GreeTarget } from './client';
import { SETPOINT_MAX, SETPOINT_MIN } from './protocol';

export type GreeLink = Extract<Link, { kind: 'gree' }>;

export interface GreeDriverOptions {
  client: GreeClient;
  /** False when this build cannot open UDP sockets. Defaults to true. */
  enabled?: boolean;
  /** How often a watched unit is read (Gree units do not push). Default 10 s. */
  pollMs?: number;
  /** How long a search for a unit that moved listens. Default 2 s. */
  scanMs?: number;
  /** Least time between two searches or re-binds for one unit. Default 30 s. */
  recoverEveryMs?: number;
  /** The unit moved to a new address or was reset (new key): save the link on the device. */
  onLinkChanged?: (deviceId: string, link: GreeLink) => Promise<void>;
  now?: () => number;
}

const DEFAULT_POLL_MS = 10_000;
const DEFAULT_SCAN_MS = 2_000;
const DEFAULT_RECOVER_EVERY_MS = 30_000;

export const GREE_CAPABILITIES: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: SETPOINT_MIN, max: SETPOINT_MAX },
  swing: true,
  sleep: true,
};

interface Unit {
  /** Where the unit is now; may be newer than the stored link until the store catches up. */
  target: GreeTarget;
  last: AcState;
  roomTemp?: number;
  /** Everyone watching this unit, told after a read and after a send it took. */
  watchers: Set<(r: Reported) => void>;
  recovering?: Promise<void>;
  lastRecovery: number;
}

function isGreeLink(link: Link): link is GreeLink {
  return link.kind === 'gree';
}

function sameTarget(a: GreeTarget, b: GreeTarget): boolean {
  return a.host === b.host && a.key === b.key && a.cipher === b.cipher;
}

export function createGreeDriver(o: GreeDriverOptions): LinkDriver & { kind: 'gree' } {
  const { client } = o;
  const pollMs = o.pollMs ?? DEFAULT_POLL_MS;
  const scanMs = o.scanMs ?? DEFAULT_SCAN_MS;
  const recoverEveryMs = o.recoverEveryMs ?? DEFAULT_RECOVER_EVERY_MS;
  const now = o.now ?? Date.now;
  const units = new Map<string, Unit>();
  /** The stored link each unit was last seen with, to notice the store catching up. */
  const stored = new Map<string, GreeTarget>();

  const unitFor = (link: GreeLink): Unit => {
    const fromLink: GreeTarget = {
      mac: link.mac,
      host: link.host,
      key: link.key,
      cipher: link.cipher,
    };
    let u = units.get(link.mac);
    const seen = stored.get(link.mac);
    stored.set(link.mac, fromLink);
    if (!u) {
      u = {
        target: fromLink,
        last: defaultAcState(),
        watchers: new Set(),
        lastRecovery: -Infinity,
      };
      units.set(link.mac, u);
    } else if (seen && !sameTarget(seen, fromLink)) {
      // The stored link changed (saved after a recovery, or added again): it wins.
      u.target = fromLink;
    }
    return u;
  };

  const tell = (u: Unit): void => {
    const r: Reported =
      u.roomTemp === undefined
        ? { kind: 'ac', state: u.last }
        : { kind: 'ac', state: u.last, roomTemp: u.roomTemp };
    u.watchers.forEach((cb) => {
      try {
        cb(r);
      } catch (e) {
        console.error('A Gree watcher threw', e);
      }
    });
  };

  const save = (deviceId: string, u: Unit): void => {
    const { mac, host, key, cipher } = u.target;
    const link: GreeLink = { kind: 'gree', mac, host, key, cipher };
    o.onLinkChanged?.(deviceId, link).catch((e: unknown) =>
      console.error('Could not save the Gree link', e),
    );
  };

  /**
   * The unit stopped answering or no longer opens our packs: bind again where it was (a reset gives
   * it a new key), else search the network for its MAC (the router gave it a new address). Runs at
   * most once per `recoverEveryMs` per unit and never throws.
   */
  const recover = (deviceId: string, u: Unit): void => {
    if (u.recovering || now() - u.lastRecovery < recoverEveryMs) return;
    u.lastRecovery = now();
    const run = async (): Promise<void> => {
      const { mac } = u.target;
      try {
        const bound = await client.bind(u.target);
        if (bound.key !== u.target.key || bound.cipher !== u.target.cipher) {
          u.target = { ...u.target, ...bound };
          save(deviceId, u);
        }
        return;
      } catch {
        // Not at its address: search below.
      }
      try {
        const found = (await client.scan(scanMs)).find((f) => f.mac === mac);
        if (!found || found.host === u.target.host) return;
        const bound = await client.bind(found);
        u.target = { mac, host: found.host, ...bound };
        save(deviceId, u);
      } catch {
        // Still gone; the next failure tries again after the pause.
      }
    };
    u.recovering = run().finally(() => {
      u.recovering = undefined;
    });
  };

  return {
    kind: 'gree',
    available: (): boolean => o.enabled ?? true,
    supports: (device: Device, link: Link, cmd: Command): boolean =>
      device.kind === 'ac' && isGreeLink(link) && cmd.kind === 'ac.set',
    capabilities: (): Capabilities => GREE_CAPABILITIES,

    send: async (device: Device, link: Link, cmd: Command, signal?: AbortSignal): Promise<void> => {
      if (!isGreeLink(link)) throw new DeviceError('noLink');
      if (device.kind !== 'ac' || cmd.kind !== 'ac.set') throw new DeviceError('unsupported');
      // The hub gave up already: send nothing.
      if (signal?.aborted) throw new DeviceError('timeout');
      const u = unitFor(link);
      try {
        await client.set(u.target, cmd.state);
      } catch (e) {
        if (e instanceof DeviceError && (e.code === 'timeout' || e.code === 'notPaired')) {
          recover(device.id, u);
        }
        throw e instanceof DeviceError ? e : new DeviceError('notSent', String(e));
      }
      u.last = cmd.state;
      tell(u);
    },

    forget: (_device: Device, link: Link): Promise<void> => {
      if (isGreeLink(link)) {
        units.delete(link.mac);
        stored.delete(link.mac);
      }
      return Promise.resolve();
    },

    observe: (device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe => {
      if (!isGreeLink(link) || device.kind !== 'ac') return () => undefined;
      const u = unitFor(link);
      u.watchers.add(cb);
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const poll = async (): Promise<void> => {
        timer = undefined;
        if (stopped) return;
        try {
          const r = await client.status(u.target, u.last);
          if (stopped) return;
          u.last = r.state;
          if (r.roomTemp !== undefined) u.roomTemp = r.roomTemp;
          tell(u);
        } catch (e) {
          if (stopped) return;
          // Off the home network: nothing to recover, the phone may come back.
          if (!(e instanceof DeviceError && e.code === 'notLocal')) recover(device.id, u);
        }
        if (!stopped) timer = setTimeout(() => void poll(), pollMs);
      };
      void poll();

      return (): void => {
        stopped = true;
        if (timer) clearTimeout(timer);
        u.watchers.delete(cb);
      };
    },
  };
}
