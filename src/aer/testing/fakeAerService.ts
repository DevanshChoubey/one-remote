import type { Device, Unsubscribe } from '@/core';
import type { HomeStore } from '@/store/types';
import type { AerError } from '../errors';
import type { DeviceStatus, Interval, Schedule } from '../protocol';
import type { AerService, AerView, FoundAer } from '../types';

export type AerOp =
  | 'scan'
  | 'blink'
  | 'add'
  | 'refresh'
  | 'sprayNow'
  | 'setAutoSpray'
  | 'resetRefill'
  | 'saveSchedules'
  | 'setTimeZone'
  | 'forget'
  | 'closeAll';

export type FakeAerService = AerService & {
  /** Every call, in order, including the ones made to fail or hold. */
  calls: { op: AerOp; deviceId?: string; arg?: unknown }[];
  /** The next call of `op` rejects with `e`. */
  failNext(op: AerOp, e: AerError): void;
  /** Calls of `op` stay pending until released. */
  hold(op: AerOp): { release(): void };
  /** Replaces what `view(v.deviceId)` returns and tells its subscribers. */
  setView(v: AerView): void;
};

const BASE_STATUS: DeviceStatus = {
  batteryMv: 3000,
  firmware: '1.0.0',
  autoSpray: null,
  scheduleRunning: false,
  spraysSinceRefill: 0,
};

export function createFakeAerService(
  opts: {
    supported?: boolean;
    found?: FoundAer[];
    views?: Record<string, AerView>;
    home?: HomeStore;
  } = {},
): FakeAerService {
  const views = new Map<string, AerView>(Object.entries(opts.views ?? {}));
  const subs = new Map<string, Set<(v: AerView) => void>>();
  const failures = new Map<AerOp, AerError[]>();
  const gates = new Map<AerOp, Promise<void>[]>();
  /** Schedules a test put in with setView; saveSchedules answers with these. */
  const held = new Map<string, Schedule[]>();
  const calls: FakeAerService['calls'] = [];

  const view = (deviceId: string): AerView => views.get(deviceId) ?? { deviceId };
  const publish = (v: AerView): void => {
    views.set(v.deviceId, v);
    for (const cb of [...(subs.get(v.deviceId) ?? [])]) cb(v);
  };
  const statusOf = (deviceId: string): DeviceStatus => {
    const s = view(deviceId).status;
    return s ? { ...s } : { ...BASE_STATUS };
  };
  const writeStatus = (deviceId: string, patch: Partial<DeviceStatus>): DeviceStatus => {
    const next = { ...statusOf(deviceId), ...patch };
    publish({ ...view(deviceId), status: { ...next, at: new Date().toISOString() } });
    return next;
  };

  /** Records the call, then waits for any hold and applies any queued failure. */
  async function enter(op: AerOp, deviceId?: string, arg?: unknown): Promise<void> {
    calls.push({
      op,
      ...(deviceId !== undefined ? { deviceId } : {}),
      ...(arg !== undefined ? { arg } : {}),
    });
    for (const gate of [...(gates.get(op) ?? [])]) await gate;
    const e = failures.get(op)?.shift();
    if (e) throw e;
  }

  return {
    calls,
    failNext(op, e) {
      failures.set(op, [...(failures.get(op) ?? []), e]);
    },
    hold(op) {
      let release = (): void => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      gates.set(op, [...(gates.get(op) ?? []), gate]);
      return {
        release() {
          gates.set(
            op,
            (gates.get(op) ?? []).filter((g) => g !== gate),
          );
          release();
        },
      };
    },
    setView(v) {
      if (v.schedules) held.set(v.deviceId, v.schedules.list);
      publish(v);
    },
    supported: () => opts.supported ?? true,
    view,
    subscribe(deviceId, cb): Unsubscribe {
      const set = subs.get(deviceId) ?? new Set();
      set.add(cb);
      subs.set(deviceId, set);
      return () => {
        set.delete(cb);
      };
    },
    scan(onFound) {
      let stopped = false;
      const done = (async () => {
        await enter('scan');
        const added = new Set(
          ((await opts.home?.devices()) ?? []).flatMap((x) =>
            x.links.flatMap((l) => (l.kind === 'aer' ? [l.bleId] : [])),
          ),
        );
        for (const d of opts.found ?? []) {
          if (stopped) return;
          if (added.has(d.bleId)) continue;
          onFound(d);
        }
      })();
      return {
        stop() {
          stopped = true;
        },
        done,
      };
    },
    async blink(deviceId, target) {
      await enter('blink', deviceId, target);
    },
    async add(device: Device) {
      await enter('add', device.id, device);
      await opts.home?.upsertDevice(device);
      if (!views.has(device.id)) publish({ deviceId: device.id });
    },
    async refresh(deviceId) {
      await enter('refresh', deviceId);
      return view(deviceId);
    },
    async sprayNow(deviceId) {
      await enter('sprayNow', deviceId);
      return writeStatus(deviceId, {});
    },
    async setAutoSpray(deviceId, interval: Interval | null) {
      await enter('setAutoSpray', deviceId, interval);
      return writeStatus(deviceId, { autoSpray: interval });
    },
    async resetRefill(deviceId) {
      await enter('resetRefill', deviceId);
      return writeStatus(deviceId, { spraysSinceRefill: 0 });
    },
    async saveSchedules(deviceId, list) {
      await enter('saveSchedules', deviceId, list);
      const saved = held.get(deviceId) ?? list;
      publish({ ...view(deviceId), schedules: { list: saved, at: new Date().toISOString() } });
      return saved;
    },
    async setTimeZone(deviceId, zone) {
      await enter('setTimeZone', deviceId, zone);
    },
    async forget(deviceId) {
      await enter('forget', deviceId);
      views.delete(deviceId);
      held.delete(deviceId);
      publish({ deviceId });
      views.delete(deviceId);
    },
    async closeAll() {
      await enter('closeAll');
    },
  };
}
