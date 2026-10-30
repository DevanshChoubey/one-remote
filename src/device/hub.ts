import type {
  AcState,
  Capabilities,
  Command,
  Device,
  DeviceErrorCode,
  FanState,
  Link,
  LinkDriver,
  LinkKind,
  Reported,
  Unsubscribe,
} from '@/core';
import { DeviceError, isIdempotent } from '@/core';

export interface LinkStatus {
  via: LinkKind | null;
  fellBack: boolean;
  problem?: DeviceErrorCode;
}

export type ViewState =
  | Reported
  | { kind: 'ac'; state: AcState; lastSent: true }
  | { kind: 'fan'; state: FanState; lastSent: true };

export interface DeviceView {
  device: Device;
  usable: boolean;
  status: LinkStatus;
  state?: ViewState;
  capabilities: Capabilities;
}

export interface DeviceHubOptions {
  drivers: LinkDriver[];
  now?: () => number;
  timeoutMs?: number;
  backoffMs?: number[];
}

/** A link of a device that can carry a command right now. `index` is its place in `device.links`. */
interface Candidate {
  index: number;
  link: Link;
  driver: LinkDriver;
}

interface Backoff {
  failures: number;
  until: number;
}

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const IDLE_STATUS: LinkStatus = { via: null, fellBack: false };

/**
 * Picks a link for each command, falls back to the next one, backs off a failed link, never resends
 * a key press that may have gone out, and never waits longer than `timeoutMs` on one link.
 */
export class DeviceHub {
  private readonly drivers = new Map<LinkKind, LinkDriver>();
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly backoffMs: number[];

  private devices = new Map<string, Device>();
  private readonly backoffs = new Map<string, Backoff>();
  private readonly statuses = new Map<string, LinkStatus>();
  private readonly states = new Map<string, ViewState>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly subscribers = new Map<string, Set<(v: DeviceView) => void>>();
  private readonly observers = new Map<string, Unsubscribe[]>();
  private readonly deviceListeners = new Set<() => void>();

  constructor(opts: DeviceHubOptions) {
    for (const d of opts.drivers) this.drivers.set(d.kind, d);
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  setDevices(devices: Device[]): void {
    this.devices = new Map(devices.map((d) => [d.id, d]));
    for (const map of [this.statuses, this.states, this.queues]) {
      for (const id of map.keys()) if (!this.devices.has(id)) map.delete(id);
    }
    for (const key of this.backoffs.keys()) {
      if (!this.devices.has(key.slice(0, key.lastIndexOf('#')))) this.backoffs.delete(key);
    }
    // Subscribed devices may have new links: observe them afresh.
    this.refresh();
    this.deviceListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('DeviceHub devices listener threw', e);
      }
    });
  }

  /** Fires after every setDevices; the hub is the source of truth for which devices exist. */
  onDevicesChanged(cb: () => void): Unsubscribe {
    this.deviceListeners.add(cb);
    return () => {
      this.deviceListeners.delete(cb);
    };
  }

  /** The devices the hub currently knows. */
  devicesKnown(): Device[] {
    return [...this.devices.values()];
  }

  /**
   * Observes afresh for every subscribed device. Call it when a driver becomes available after
   * devices were subscribed (observing only starts on drivers that are available() at that time).
   */
  refresh(): void {
    for (const id of this.subscribers.keys()) {
      this.stopObserving(id);
      if (!this.devices.has(id)) continue;
      try {
        this.startObserving(id);
      } catch (e) {
        console.error('DeviceHub could not observe', id, e);
      }
    }
  }

  view(deviceId: string): DeviceView {
    const device = this.device(deviceId);
    const available = device.links.filter((l) => this.drivers.get(l.kind)?.available());
    const first = available[0];
    const firstDriver = first && this.drivers.get(first.kind);
    const state = this.states.get(deviceId);
    return {
      device,
      usable: available.length > 0,
      status: this.statuses.get(deviceId) ?? IDLE_STATUS,
      ...(state ? { state } : {}),
      capabilities: first && firstDriver ? firstDriver.capabilities(device, first) : {},
    };
  }

  /** Sends are serialised per device, so key presses keep their order. */
  send(deviceId: string, cmd: Command): Promise<{ via: LinkKind; fellBack: boolean }> {
    const prev = this.queues.get(deviceId) ?? Promise.resolve();
    const run = prev.then(() => this.sendNow(deviceId, cmd));
    this.queues.set(
      deviceId,
      run.catch(() => undefined),
    );
    return run;
  }

  subscribe(deviceId: string, cb: (v: DeviceView) => void): Unsubscribe {
    this.device(deviceId);
    let subs = this.subscribers.get(deviceId);
    if (!subs) {
      this.startObserving(deviceId); // throws before anything is stored
      subs = new Set();
      this.subscribers.set(deviceId, subs);
    }
    subs.add(cb);
    return () => {
      if (!subs.delete(cb) || subs.size > 0) return;
      this.subscribers.delete(deviceId);
      this.stopObserving(deviceId);
    };
  }

  // ---- sending ----

  private async sendNow(
    deviceId: string,
    cmd: Command,
  ): Promise<{ via: LinkKind; fellBack: boolean }> {
    try {
      const device = this.device(deviceId);
      const result = await this.tryLinks(device, cmd);
      if (this.devices.has(deviceId)) this.statuses.set(deviceId, result);
      return result;
    } catch (e) {
      if (e instanceof DeviceError && this.devices.has(deviceId)) {
        this.statuses.set(deviceId, { via: null, fellBack: false, problem: e.code });
      }
      throw e;
    } finally {
      this.notify(deviceId);
    }
  }

  private async tryLinks(
    device: Device,
    cmd: Command,
  ): Promise<{ via: LinkKind; fellBack: boolean }> {
    const order = this.pickOrder(device, this.candidates(device, cmd));
    if (order.length === 0) throw new DeviceError(this.noCandidateCode(device));

    let lastError: unknown;
    for (const c of order) {
      try {
        await this.withTimeout(c.driver.send(device, c.link, cmd));
      } catch (e) {
        this.markFailed(device.id, c.link.kind);
        lastError = e;
        if (!this.shouldTryNext(e, cmd)) throw e;
        continue;
      }
      this.backoffs.delete(backoffKey(device.id, c.link.kind));
      this.rememberSent(device.id, c.driver, cmd);
      return { via: c.link.kind, fellBack: c.index > 0 };
    }
    throw lastError;
  }

  /** `device.links` in order, keeping those whose driver is available and supports `cmd`. */
  private candidates(device: Device, cmd: Command): Candidate[] {
    const out: Candidate[] = [];
    device.links.forEach((link, index) => {
      const driver = this.drivers.get(link.kind);
      if (driver?.available() && driver.supports(device, link, cmd)) {
        out.push({ index, link, driver });
      }
    });
    return out;
  }

  /** Skips links that are backing off. If all are, tries the one whose backoff ends soonest. */
  private pickOrder(device: Device, candidates: Candidate[]): Candidate[] {
    const t = this.now();
    const until = (c: Candidate): number =>
      this.backoffs.get(backoffKey(device.id, c.link.kind))?.until ?? 0;
    const ready = candidates.filter((c) => until(c) <= t);
    if (ready.length > 0 || candidates.length === 0) return ready;
    const soonest = candidates.reduce((a, b) => (until(b) < until(a) ? b : a));
    return [soonest];
  }

  private shouldTryNext(e: unknown, cmd: Command): boolean {
    if (!(e instanceof DeviceError)) return false;
    // Nothing went out in either case, so the next link may carry it.
    if (e.code === 'notSent' || e.code === 'notLocal') return true;
    // A timed-out send may have gone out: only repeat it when that is harmless.
    return e.code === 'timeout' && isIdempotent(cmd);
  }

  private noCandidateCode(device: Device): DeviceErrorCode {
    const allIr = device.links.length > 0 && device.links.every((l) => l.kind === 'ir');
    return allIr && !this.drivers.get('ir')?.available() ? 'noIrEmitter' : 'noLink';
  }

  private withTimeout(p: Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new DeviceError('timeout')), this.timeoutMs);
      p.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  private markFailed(deviceId: string, kind: LinkKind): void {
    const key = backoffKey(deviceId, kind);
    const failures = (this.backoffs.get(key)?.failures ?? 0) + 1;
    const step = Math.min(failures, this.backoffMs.length) - 1;
    this.backoffs.set(key, { failures, until: this.now() + (this.backoffMs[step] ?? 0) });
  }

  /** Links that cannot report state keep the last state we sent, so the UI has something to show. */
  private rememberSent(deviceId: string, driver: LinkDriver, cmd: Command): void {
    if (driver.observe || !this.devices.has(deviceId)) return;
    if (cmd.kind === 'ac.set') {
      this.states.set(deviceId, { kind: 'ac', state: cmd.state, lastSent: true });
    } else if (cmd.kind === 'fan.set') {
      this.states.set(deviceId, { kind: 'fan', state: cmd.state, lastSent: true });
    }
  }

  // ---- observing ----

  private startObserving(deviceId: string): void {
    const device = this.device(deviceId);
    const stops: Unsubscribe[] = [];
    try {
      for (const link of device.links) {
        const driver = this.drivers.get(link.kind);
        if (!driver?.available() || !driver.observe) continue;
        stops.push(
          driver.observe(device, link, (r) => {
            this.states.set(deviceId, r);
            this.notify(deviceId);
          }),
        );
      }
    } catch (e) {
      // Roll back, so a later subscribe can try again from scratch.
      stops.forEach((stop) => stop());
      throw e;
    }
    this.observers.set(deviceId, stops);
  }

  private stopObserving(deviceId: string): void {
    this.observers.get(deviceId)?.forEach((stop) => stop());
    this.observers.delete(deviceId);
  }

  private notify(deviceId: string): void {
    const subs = this.subscribers.get(deviceId);
    if (!subs || subs.size === 0 || !this.devices.has(deviceId)) return;
    const v = this.view(deviceId);
    // One broken subscriber must not reach the others, nor turn a delivered send into a rejection.
    subs.forEach((cb) => {
      try {
        cb(v);
      } catch (e) {
        console.error('DeviceHub subscriber threw', e);
      }
    });
  }

  private device(deviceId: string): Device {
    const d = this.devices.get(deviceId);
    if (!d) throw new DeviceError('noLink', `Unknown device ${deviceId}`);
    return d;
  }
}

/** Keyed by link kind, so reordering a device's links keeps each link's backoff. */
function backoffKey(deviceId: string, kind: LinkKind): string {
  return `${deviceId}#${kind}`;
}
