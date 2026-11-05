// From aer-remote src/device/client.ts (2026-11-04). Adapted: imports moved to @/aer; DeviceError renamed AerError; sessions open on the saved bleId (store key stays id); add and blink take the bleId.
import type { BleTransport, FoundDevice } from '@/transport/ble/transport';
import {
  fetchStatusMsg,
  refillMsg,
  removeSchedulesMsg,
  retrieveSchedulesMsg,
  setSchedulesMsg,
  sprayNowMsg,
  stopAutoSprayMsg,
  testLedMsg,
} from '@/aer/protocol/messages';
import { parseSchedules, ReplyParseError } from '@/aer/protocol/replies';
import {
  MAX_SCHEDULES,
  validateSchedule,
  type Interval,
  type Schedule,
} from '@/aer/protocol/schedule';
import { isBatteryTooLow, parseStatus, type DeviceStatus } from '@/aer/protocol/status';
import type { DispenserStore, SavedDispenser } from '@/aer/types';

import { AerError } from '@/aer/errors';
import {
  checkAdapter,
  openSession,
  type DispenserSession,
  type SessionOptions,
} from '@/aer/session';

export interface ClientOptions extends SessionOptions {
  /** Close the session this long after the last operation. Default 10000. */
  idleMs?: number;
  /** Pause between removing and setting schedules. Default 3000. */
  scheduleGapMs?: number;
}

const DEFAULT_IDLE_MS = 10000;
const DEFAULT_SCHEDULE_GAP_MS = 3000;

const UNREADABLE_SCHEDULES = 'unreadable schedules reply';

const isUnreadable = (e: unknown): boolean =>
  e instanceof AerError && e.message === UNREADABLE_SCHEDULES;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface DeviceState {
  session: DispenserSession | null;
  /** Operations queued or running; the idle timer only runs at zero. */
  inflight: number;
  tail: Promise<unknown>;
  storeTail: Promise<unknown>;
  timer: ReturnType<typeof setTimeout> | null;
  /** What a session opened for an unsaved device learned; add() saves it, nothing else does. */
  unsaved?: {
    channels: SavedDispenser['channels'];
    clockSet: boolean;
    status: DeviceStatus;
    /** The zone its clock was set in. */
    homeTimeZone: string;
  };
}

export class DispenserClient {
  private readonly devices = new Map<string, DeviceState>();
  private readonly idleMs: number;
  private readonly scheduleGapMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly transport: BleTransport,
    private readonly store: DispenserStore,
    private readonly opts: ClientOptions = {},
  ) {
    this.idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
    this.scheduleGapMs = opts.scheduleGapMs ?? DEFAULT_SCHEDULE_GAP_MS;
    this.now = opts.now ?? ((): Date => new Date());
  }

  /**
   * Asks for permissions and checks the radio first; when either fails, `done` rejects with
   * permissionDenied or bluetoothOff and no scan starts.
   */
  scan(
    onFound: (d: FoundDevice) => void,
    timeoutMs: number,
  ): { stop(): void; done: Promise<void> } {
    let inner: { stop(): void; done: Promise<void> } | null = null;
    let stopped = false;
    const done = checkAdapter(this.transport).then(async () => {
      if (stopped) return;
      inner = this.transport.scan(onFound, timeoutMs);
      await inner.done;
    });
    return {
      stop: (): void => {
        stopped = true;
        inner?.stop();
      },
      done,
    };
  }

  async add(
    id: string,
    name: string,
    homeTimeZone: string,
    bleId: string,
  ): Promise<SavedDispenser> {
    await this.run(id, async () => {
      const existing = await this.store.get(id);
      const base: SavedDispenser = { ...existing, id, bleId, name, homeTimeZone };
      const blinked = this.state(id).unsaved;
      if (blinked && blinked.homeTimeZone !== homeTimeZone) {
        // The blink set the clock in another zone; reconnect so it is set in the home zone.
        await this.closeSession(id);
        base.channels ??= blinked.channels;
      }
      await this.session(id, base);
      const st = this.state(id);
      if (st.unsaved) {
        // The session was opened by blink() before the device was saved: save what it learned now.
        const { channels, clockSet, status } = st.unsaved;
        st.unsaved = undefined;
        await this.upsertOpened(base, true, channels, clockSet, status);
      }
      // A reused session skips the open-time save, so write the identity here.
      await this.patch(id, (d) => ({ ...d, name, homeTimeZone, bleId }));
    });
    const saved = await this.store.get(id);
    if (!saved) throw new AerError('unreachable', 'dispenser was removed');
    return saved;
  }

  /**
   * Blink the LED. For a device that is not saved yet, pass the Bluetooth id and time zone to open its session with;
   * nothing is stored until add() runs, and the session closes on idle like any other.
   */
  blink(id: string, target?: { bleId: string; homeTimeZone: string }): Promise<void> {
    return this.run(id, async () => {
      const s = await this.session(id, undefined, target);
      await s.send(testLedMsg(s.nextMN()));
    });
  }

  refresh(id: string): Promise<{ status: DeviceStatus; schedules: Schedule[] }> {
    return this.withSession(id, async (s) => {
      const status = await this.fetchStatus(s);
      let schedules: Schedule[];
      try {
        schedules = await this.retrieve(s);
      } catch (e) {
        if (isUnreadable(e)) {
          // Unknown beats stale: keep the new status, forget the list the device no longer matches.
          await this.patch(id, ({ schedules: _gone, ...rest }) => ({
            ...rest,
            lastStatus: { ...status, at: this.stamp() },
          }));
        }
        throw e;
      }
      await this.patch(id, (d) => ({
        ...d,
        lastStatus: { ...status, at: this.stamp() },
        schedules: { list: schedules, at: this.stamp() },
      }));
      return { status, schedules };
    });
  }

  sprayNow(id: string): Promise<DeviceStatus> {
    return this.withSession(id, async (s) => {
      await s.send(sprayNowMsg(s.nextMN(), 0));
      const status = await this.finish(id, s);
      if (isBatteryTooLow(status.batteryMv)) throw new AerError('rejected', 'batteryTooLow');
      return status;
    });
  }

  setAutoSpray(id: string, interval: Interval | null): Promise<DeviceStatus> {
    return this.withSession(id, async (s) => {
      await s.send(
        interval === null ? stopAutoSprayMsg(s.nextMN()) : sprayNowMsg(s.nextMN(), interval),
      );
      const status = await this.finish(id, s);
      if (interval === null) return status;
      // The device acks below the cutoff without spraying, and during a schedule window it acks but
      // keeps auto-spray off, so trust the status read back, not the ack.
      if (isBatteryTooLow(status.batteryMv)) throw new AerError('rejected', 'batteryTooLow');
      if (status.autoSpray !== interval) {
        throw new AerError(
          'rejected',
          status.scheduleRunning ? 'scheduleRunning' : 'auto spray not on',
        );
      }
      return status;
    });
  }

  resetRefill(id: string): Promise<DeviceStatus> {
    return this.withSession(id, async (s) => {
      await s.send(refillMsg(s.nextMN()));
      return this.finish(id, s);
    });
  }

  async saveSchedules(id: string, list: Schedule[]): Promise<Schedule[]> {
    if (list.length > MAX_SCHEDULES || list.some((s) => validateSchedule(s).length > 0)) {
      throw new AerError('rejected', 'invalid schedules');
    }
    return this.run(id, async () => {
      try {
        const s = await this.session(id);
        await s.send(removeSchedulesMsg(s.nextMN()));
        if (list.length > 0) {
          await sleep(this.scheduleGapMs);
          await s.send(setSchedulesMsg(s.nextMN(), list));
        }
        const readBack = await this.retrieve(s);
        await this.patch(id, (d) => ({ ...d, schedules: { list: readBack, at: this.stamp() } }));
        try {
          await this.finish(id, s);
        } catch {
          // The read-back is already stored; a failed status refresh keeps the old status.
        }
        return readBack;
      } catch (e) {
        await this.recordDeviceSchedules(id);
        throw e;
      }
    });
  }

  async rename(id: string, name: string): Promise<void> {
    await this.patch(id, (d) => ({ ...d, name }));
  }

  /**
   * Changes the zone used the next time the clock is set. Closes any live session so the next
   * connect sends the new zone. Rejects with `timeZone` for a zone the phone does not know.
   */
  async setHomeTimeZone(id: string, zone: string): Promise<void> {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
    } catch {
      throw new AerError('timeZone', 'invalid time zone');
    }
    await this.run(id, async () => {
      await this.closeSession(id);
      await this.patch(id, (d) => ({ ...d, homeTimeZone: zone }));
    });
  }

  async remove(id: string): Promise<void> {
    await this.run(id, async () => {
      await this.closeSession(id);
      await this.patch(id, () => null);
    });
    const st = this.devices.get(id);
    if (st && st.inflight === 0) this.devices.delete(id);
  }

  /**
   * Closes every open session, each one queued behind its device's running operations, and clears
   * the idle timers. Used when the app goes to the background so no dispenser stays held.
   */
  async closeAll(): Promise<void> {
    const ids = [...this.devices.keys()];
    await Promise.all(
      ids.map(async (id) => {
        const st = this.state(id);
        if (st.timer) clearTimeout(st.timer);
        st.timer = null;
        await this.run(id, () => this.closeSession(id)).catch((e: unknown) =>
          console.warn('Could not close a dispenser connection', e),
        );
        await this.forgetIfUnsaved(id, st).catch(() => undefined);
      }),
    );
  }

  private state(id: string): DeviceState {
    let st = this.devices.get(id);
    if (!st) {
      st = {
        session: null,
        inflight: 0,
        tail: Promise.resolve(),
        storeTail: Promise.resolve(),
        timer: null,
      };
      this.devices.set(id, st);
    }
    return st;
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  /** Run one operation on a device after the ones before it; manages the idle timer. */
  private run<T>(id: string, op: () => Promise<T>): Promise<T> {
    const st = this.state(id);
    if (st.timer) clearTimeout(st.timer);
    st.timer = null;
    st.inflight += 1;
    const result = st.tail.then(op);
    st.tail = result.catch(() => undefined);
    const settle = (): void => {
      st.inflight -= 1;
      if (st.inflight === 0 && st.session) this.armIdle(id, st);
    };
    return result.finally(settle);
  }

  private armIdle(id: string, st: DeviceState): void {
    st.timer = setTimeout(() => {
      st.timer = null;
      if (st.inflight !== 0) return;
      // Queue the close behind the device's operations so a new connect cannot overlap it.
      st.tail = st.tail
        .then(() => this.closeSession(id))
        .then(() => this.forgetIfUnsaved(id, st))
        .catch(() => undefined);
    }, this.idleMs);
  }

  /** Drops the bookkeeping of a device that was only blinked and never saved. */
  private async forgetIfUnsaved(id: string, st: DeviceState): Promise<void> {
    if (st.inflight !== 0 || st.session || this.devices.get(id) !== st) return;
    if ((await this.store.get(id)) === null && st.inflight === 0 && !st.session) {
      this.devices.delete(id);
    }
  }

  private withSession<T>(id: string, op: (s: DispenserSession) => Promise<T>): Promise<T> {
    return this.run(id, async () => op(await this.session(id)));
  }

  /** The live session for a device, opening one (and saving what it learns) if needed. */
  private async session(
    id: string,
    base?: SavedDispenser,
    target?: { bleId: string; homeTimeZone: string },
  ): Promise<DispenserSession> {
    const st = this.state(id);
    if (st.session?.connected) return st.session;
    st.session = null;
    st.unsaved = undefined;
    let known = base ?? (await this.store.get(id));
    let unsaved = false;
    if (!known && target !== undefined) {
      known = { id, bleId: target.bleId, name: '', homeTimeZone: target.homeTimeZone };
      unsaved = true;
    }
    if (!known) throw new AerError('unreachable', 'unknown dispenser');
    const opened = await openSession(
      this.transport,
      known.bleId,
      known.homeTimeZone,
      known.channels,
      this.opts,
    );
    const { session } = opened;
    st.session = session;
    session.onDisconnect(() => {
      if (st.session === session) st.session = null;
    });
    if (unsaved) {
      st.unsaved = {
        channels: opened.channels,
        clockSet: opened.clockSet,
        status: opened.status,
        homeTimeZone: known.homeTimeZone,
      };
      return session;
    }
    await this.upsertOpened(
      known,
      base !== undefined,
      opened.channels,
      opened.clockSet,
      opened.status,
    );
    return session;
  }

  private async upsertOpened(
    known: SavedDispenser,
    create: boolean,
    channels: SavedDispenser['channels'],
    clockSet: boolean,
    status: DeviceStatus,
  ): Promise<void> {
    const learned = { channels, clockSet, lastStatus: { ...status, at: this.stamp() } };
    const st = this.state(known.id);
    const run = st.storeTail.then(async () => {
      // Merge onto the record as it is now, so a rename made while opening survives.
      const current = await this.store.get(known.id);
      if (current) await this.store.upsert({ ...current, ...learned });
      else if (create) await this.store.upsert({ ...known, ...learned });
    });
    st.storeTail = run.catch(() => undefined);
    await run;
  }

  private async closeSession(id: string): Promise<void> {
    const st = this.state(id);
    if (st.timer) clearTimeout(st.timer);
    st.timer = null;
    const session = st.session;
    st.session = null;
    st.unsaved = undefined;
    await session?.close();
  }

  /** Read-modify-write one record; a null result deletes it. Missing records are never recreated. */
  private patch(id: string, change: (d: SavedDispenser) => SavedDispenser | null): Promise<void> {
    const st = this.state(id);
    const run = st.storeTail.then(async () => {
      const current = await this.store.get(id);
      if (!current) return;
      const next = change(current);
      if (next === null) await this.store.remove(id);
      else await this.store.upsert(next);
    });
    st.storeTail = run.catch(() => undefined);
    return run;
  }

  private async fetchStatus(s: DispenserSession): Promise<DeviceStatus> {
    const reply = await s.send(fetchStatusMsg(s.nextMN()));
    try {
      return parseStatus(reply);
    } catch {
      throw new AerError('noReply', 'unreadable status reply');
    }
  }

  private async retrieve(s: DispenserSession): Promise<Schedule[]> {
    const reply = await s.send(retrieveSchedulesMsg(s.nextMN()));
    try {
      return parseSchedules(reply);
    } catch (e) {
      if (e instanceof ReplyParseError) throw new AerError('noReply', UNREADABLE_SCHEDULES);
      throw e;
    }
  }

  /** Fetch status after a change and store it. */
  private async finish(id: string, s: DispenserSession): Promise<DeviceStatus> {
    const status = await this.fetchStatus(s);
    await this.patch(id, (d) => ({ ...d, lastStatus: { ...status, at: this.stamp() } }));
    return status;
  }

  /** After a failed save, learn what the device now holds. One attempt; failures are ignored. */
  private async recordDeviceSchedules(id: string): Promise<void> {
    try {
      const s = await this.session(id);
      const list = await this.retrieve(s);
      await this.patch(id, (d) => ({ ...d, schedules: { list, at: this.stamp() } }));
    } catch {
      // The original error is the one the caller needs. Unknown beats stale: forget the list.
      await this.patch(id, ({ schedules: _gone, ...rest }) => rest).catch(() => undefined);
    }
  }
}
