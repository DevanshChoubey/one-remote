// From aer-remote tests/device/client.test.ts (2026-11-04). Adapted: imports and DeviceError->AerError; fixtures carry bleId; blink and add take the bleId; two new cases for bleId and busy.
import { createFakeTransport, type FakeDispenserOptions } from '@/aer/testing/fakeDispenser';
import type { BleTransport } from '@/transport/ble/transport';
import { DispenserClient, type ClientOptions } from '@/aer/client';
import { AerError } from '@/aer/errors';
import type { Schedule } from '@/aer/protocol/schedule';
import { charUuid } from '@/aer/protocol/uuids';
import { createMemoryDispenserStore } from '@/aer/testing/memoryDispenserStore';

const ID = 'dev1';
const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-10-26T10:00:00Z');
const morning: Schedule = {
  start: { h: 8, m: 0 },
  end: { h: 9, m: 0 },
  days: ['mon', 'wed'],
  interval: 20,
};

interface Rig {
  t: ReturnType<typeof createFakeTransport>;
  store: ReturnType<typeof createMemoryDispenserStore>;
  client: DispenserClient;
  counts: { connects: number; disconnects: number };
  gate: { disconnect: Promise<void> | null; busyAfterWrites: number | null };
}

const rig = (device: FakeDispenserOptions = {}, opts: ClientOptions = {}): Rig => {
  const t = createFakeTransport({ [ID]: device });
  const counts = { connects: 0, disconnects: 0 };
  const gate: Rig['gate'] = { disconnect: null, busyAfterWrites: null };
  let writes = 0;
  const wrapped: BleTransport = {
    adapterState: () => t.adapterState(),
    requestPermissions: () => t.requestPermissions(),
    scan: (cb, ms) => t.scan(cb, ms),
    async connect(id, ms) {
      const c = await t.connect(id, ms);
      counts.connects += 1;
      return {
        ...c,
        characteristics: () => c.characteristics(),
        write: async (u, b) => {
          writes += 1;
          if (writes === gate.busyAfterWrites) device.busy = true;
          await c.write(u, b);
        },
        subscribe: (u, cb) => c.subscribe(u, cb),
        onDisconnect: (cb) => c.onDisconnect(cb),
        disconnect: async () => {
          counts.disconnects += 1;
          if (gate.disconnect) await gate.disconnect;
          await c.disconnect();
        },
      };
    },
  };
  const store = createMemoryDispenserStore();
  const client = new DispenserClient(wrapped, store, { now: () => NOW, idleMs: 200, ...opts });
  return { t, store, client, counts, gate };
};

const mts = (r: Rig): number[] => r.t.state(ID).writes.map((w) => w.mT);

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AerError) return e.code;
    throw e;
  }
  return 'resolved';
};

afterEach(() => {
  jest.useRealTimers();
});

describe('scan permissions', () => {
  it('rejects done with permissionDenied and never scans when denied', async () => {
    const t = createFakeTransport({ [ID]: {} }, { permissionsGranted: false });
    const scan = jest.spyOn(t, 'scan');
    const client = new DispenserClient(t, createMemoryDispenserStore());
    const found: string[] = [];
    const handle = client.scan((d) => found.push(d.id), 1000);
    await expect(handle.done).rejects.toMatchObject({ code: 'permissionDenied' });
    expect(scan).not.toHaveBeenCalled();
    expect(found).toEqual([]);
  });

  it('scans when granted', async () => {
    const t = createFakeTransport({ [ID]: {} });
    const client = new DispenserClient(t, createMemoryDispenserStore());
    const found: string[] = [];
    await client.scan((d) => found.push(d.id), 1000).done;
    expect(found).toEqual([ID]);
  });

  it.each([
    ['off', 'bluetoothOff'],
    ['unsupported', 'bluetoothOff'],
    ['unauthorized', 'permissionDenied'],
  ] as const)('rejects done with %s adapter as %s and never scans', async (state, code) => {
    const t = createFakeTransport({ [ID]: {} }, { adapterState: state });
    const scan = jest.spyOn(t, 'scan');
    const client = new DispenserClient(t, createMemoryDispenserStore());
    const handle = client.scan(() => undefined, 1000);
    await expect(handle.done).rejects.toMatchObject({ name: 'AerError', code });
    expect(scan).not.toHaveBeenCalled();
  });

  it('wraps a permission request failure as permissionDenied in scan and add', async () => {
    const t = createFakeTransport({ [ID]: {} });
    jest.spyOn(t, 'requestPermissions').mockRejectedValue(new Error('activity gone'));
    const connect = jest.spyOn(t, 'connect');
    const client = new DispenserClient(t, createMemoryDispenserStore());
    await expect(client.scan(() => undefined, 1000).done).rejects.toMatchObject({
      name: 'AerError',
      code: 'permissionDenied',
    });
    await expect(client.add(ID, 'Hall', TZ, ID)).rejects.toMatchObject({
      name: 'AerError',
      code: 'permissionDenied',
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('openSession through the client rejects when denied', async () => {
    const t = createFakeTransport({ [ID]: {} }, { permissionsGranted: false });
    const connect = jest.spyOn(t, 'connect');
    const client = new DispenserClient(t, createMemoryDispenserStore());
    await expect(client.add(ID, 'Hall', TZ, ID)).rejects.toMatchObject({
      code: 'permissionDenied',
    });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('add and scan', () => {
  it('saves the probed channels, status and clock flag', async () => {
    jest.useFakeTimers();
    const r = rig({ commandChar: charUuid('0002') });
    const adding = r.client.add(ID, 'Hall', TZ, ID);
    await jest.advanceTimersByTimeAsync(10000);
    const saved = await adding;
    expect(saved.name).toBe('Hall');
    expect(saved.channels?.command).toBe(charUuid('0002'));
    expect(saved.clockSet).toBe(true);
    expect(saved.lastStatus?.batteryMv).toBe(3000);
    expect(saved.lastStatus?.at).toBe(NOW.toISOString());
    expect(await r.store.get(ID)).toEqual(saved);
  });

  it('does not save anything when the device is busy', async () => {
    jest.useFakeTimers();
    const r = rig({ busy: true });
    const p = codeOf(r.client.add(ID, 'Hall', TZ, ID));
    await jest.advanceTimersByTimeAsync(5000);
    expect(await p).toBe('unreachable');
    expect(await r.store.list()).toEqual([]);
  });

  it('scans through the transport', async () => {
    const r = rig();
    const found: string[] = [];
    await r.client.scan((d) => found.push(d.id), 1000).done;
    expect(found).toEqual([ID]);
  });
});

describe('operations', () => {
  it('blinks the LED', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    await r.client.blink(ID);
    expect(r.t.state(ID).ledBlinks).toBe(1);
  });

  it('sprayNow increments the counter and stores the new status', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    const status = await r.client.sprayNow(ID);
    expect(status.spraysSinceRefill).toBe(1);
    expect(r.t.state(ID).spraysSinceRefill).toBe(1);
    expect((await r.store.get(ID))?.lastStatus?.spraysSinceRefill).toBe(1);
  });

  it('sprayNow rejects with batteryTooLow on a low battery but still stores the status', async () => {
    const r = rig({ batteryMv: 2300 });
    await r.client.add(ID, 'Hall', TZ, ID);
    let err: unknown;
    try {
      await r.client.sprayNow(ID);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AerError);
    expect(err).toMatchObject({ code: 'rejected', message: 'batteryTooLow' });
    expect((await r.store.get(ID))?.lastStatus?.batteryMv).toBe(2300);
  });

  it('setAutoSpray sets an interval and null stops it', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    expect((await r.client.setAutoSpray(ID, 20)).autoSpray).toBe(20);
    expect(r.t.state(ID).autoSpray).toBe(20);
    expect((await r.client.setAutoSpray(ID, null)).autoSpray).toBeNull();
    expect(r.t.state(ID).autoSpray).toBeNull();
    expect(mts(r)).toContain(106);
  });

  it('setAutoSpray rejects with batteryTooLow on a low battery but still stores the status', async () => {
    const r = rig({ batteryMv: 2300 });
    await r.client.add(ID, 'Hall', TZ, ID);
    await expect(r.client.setAutoSpray(ID, 20)).rejects.toMatchObject({
      code: 'rejected',
      message: 'batteryTooLow',
    });
    expect((await r.store.get(ID))?.lastStatus?.batteryMv).toBe(2300);
  });

  it('setAutoSpray turns auto spray off on a low battery', async () => {
    const r = rig({ batteryMv: 2300 });
    await r.client.add(ID, 'Hall', TZ, ID);
    expect((await r.client.setAutoSpray(ID, null)).autoSpray).toBeNull();
  });

  it('setAutoSpray rejects with scheduleRunning when a schedule window keeps auto spray off', async () => {
    const r = rig({ scheduleWindow: 20 });
    await r.client.add(ID, 'Hall', TZ, ID);
    await expect(r.client.setAutoSpray(ID, 10)).rejects.toMatchObject({
      code: 'rejected',
      message: 'scheduleRunning',
    });
    const stored = (await r.store.get(ID))?.lastStatus;
    expect(stored?.scheduleRunning).toBe(true);
    expect(stored?.autoSpray).toBeNull();
  });

  it('setAutoSpray rejects when the dispenser acknowledges but reports another state', async () => {
    const r = rig({ ignoreAutoSpray: true });
    await r.client.add(ID, 'Hall', TZ, ID);
    expect(await codeOf(r.client.setAutoSpray(ID, 40))).toBe('rejected');
  });

  it('resetRefill zeroes the counter', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    await r.client.sprayNow(ID);
    const status = await r.client.resetRefill(ID);
    expect(status.spraysSinceRefill).toBe(0);
    expect((await r.store.get(ID))?.lastStatus?.spraysSinceRefill).toBe(0);
  });

  it('refresh returns and stores status and schedules', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    r.t.state(ID).schedules = [morning];
    const out = await r.client.refresh(ID);
    expect(out.schedules).toEqual([morning]);
    expect(out.status.batteryMv).toBe(3000);
    expect((await r.store.get(ID))?.schedules).toEqual({
      list: [morning],
      at: NOW.toISOString(),
    });
  });

  it('refresh rejects an undecodable schedule list and forgets the cached one', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    r.t.state(ID).schedules = [morning];
    await r.client.refresh(ID);
    expect((await r.store.get(ID))?.schedules?.list).toEqual([morning]);
    r.t.state(ID).badScheduleReply = true;
    expect(await codeOf(r.client.refresh(ID))).toBe('noReply');
    const saved = await r.store.get(ID);
    expect(saved?.schedules).toBeUndefined();
    expect(saved?.lastStatus?.batteryMv).toBe(3000);
    await r.client.remove(ID);
  });

  it('rejects an unknown dispenser without connecting', async () => {
    const r = rig();
    expect(await codeOf(r.client.blink('nope'))).toBe('unreachable');
    expect(r.counts.connects).toBe(0);
  });
});

describe('saveSchedules', () => {
  it('writes 108, waits the gap, writes 103, then 109, and returns the read-back', async () => {
    jest.useFakeTimers();
    const r = rig({}, { scheduleGapMs: 3000 });
    const added = r.client.add(ID, 'Hall', TZ, ID);
    await jest.advanceTimersByTimeAsync(0);
    await added;
    const base = mts(r).length;
    const p = r.client.saveSchedules(ID, [morning]);
    await jest.advanceTimersByTimeAsync(2999);
    expect(mts(r).slice(base)).toEqual([108]);
    await jest.advanceTimersByTimeAsync(1);
    const list = await p;
    expect(
      mts(r)
        .slice(base)
        .filter((m) => m !== 107),
    ).toEqual([108, 103, 109]);
    expect(list).toEqual([morning]);
    expect((await r.store.get(ID))?.schedules?.list).toEqual([morning]);
  });

  it('with an empty list removes and skips the set', async () => {
    const r = rig({}, { scheduleGapMs: 0 });
    await r.client.add(ID, 'Hall', TZ, ID);
    r.t.state(ID).schedules = [morning];
    expect(await r.client.saveSchedules(ID, [])).toEqual([]);
    expect(mts(r)).not.toContain(103);
    expect(r.t.state(ID).schedules).toEqual([]);
  });

  it('rejects an invalid list before any write or connect', async () => {
    const r = rig();
    const bad: Schedule = { ...morning, days: [] };
    expect(await codeOf(r.client.saveSchedules(ID, [bad]))).toBe('rejected');
    expect(r.counts.connects).toBe(0);
    expect(mts(r)).toEqual([]);
  });

  it('on a mid-way drop retrieves what the device has, stores it and rethrows', async () => {
    // Writes: 102 set-time, 107 status, 108 remove (drops here).
    const r = rig({ disconnectAfter: 3 }, { scheduleGapMs: 0 });
    r.t.state(ID).schedules = [morning];
    // Seed the store so the client knows the device without using the dropped write count.
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    jest.useFakeTimers();
    const p = codeOf(r.client.saveSchedules(ID, [morning]));
    await jest.advanceTimersByTimeAsync(10000);
    expect(await p).toBe('disconnected');
    expect((await r.store.get(ID))?.schedules?.list).toEqual([]);
  });

  it('keeps the session open through a long save', async () => {
    jest.useFakeTimers();
    const r = rig({}, { idleMs: 1000, scheduleGapMs: 3000 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    const p = r.client.saveSchedules(ID, [morning]);
    await jest.advanceTimersByTimeAsync(3500);
    expect(await p).toEqual([morning]);
    expect(r.counts.disconnects).toBe(0);
    expect(r.counts.connects).toBe(1);
  });
});

describe('session lifecycle', () => {
  it('closes the session idleMs after the last operation', async () => {
    jest.useFakeTimers();
    const r = rig({}, { idleMs: 10000 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    await r.client.blink(ID);
    await jest.advanceTimersByTimeAsync(9999);
    expect(r.counts.disconnects).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(r.counts.disconnects).toBe(1);
    await r.client.blink(ID);
    expect(r.counts.connects).toBe(2);
  });

  it('closeAll closes an open session at once and clears its idle timer', async () => {
    jest.useFakeTimers();
    const r = rig({}, { idleMs: 10000 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    await r.client.blink(ID);
    expect(r.counts.disconnects).toBe(0);
    await r.client.closeAll();
    expect(r.counts.disconnects).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(20000);
    expect(r.counts.disconnects).toBe(1);
    await r.client.blink(ID);
    expect(r.counts.connects).toBe(2);
  });

  it('closeAll waits for the running operation before closing', async () => {
    jest.useFakeTimers();
    const r = rig({ replyDelayMs: 50 }, { idleMs: 10000 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    const blink = r.client.blink(ID);
    const closing = r.client.closeAll();
    await jest.advanceTimersByTimeAsync(1000);
    await expect(blink).resolves.toBeUndefined();
    await closing;
    expect(r.t.state(ID).ledBlinks).toBe(1);
    expect(r.counts.disconnects).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('closeAll with nothing open does nothing', async () => {
    const r = rig();
    await expect(r.client.closeAll()).resolves.toBeUndefined();
    expect(r.counts.disconnects).toBe(0);
  });

  it('restarts the idle timer after each operation', async () => {
    jest.useFakeTimers();
    const r = rig({}, { idleMs: 10000 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    await r.client.blink(ID);
    await jest.advanceTimersByTimeAsync(8000);
    await r.client.blink(ID);
    await jest.advanceTimersByTimeAsync(8000);
    expect(r.counts.disconnects).toBe(0);
    expect(r.counts.connects).toBe(1);
  });

  it('shares one session between concurrent operations and runs them in order', async () => {
    const r = rig();
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    await Promise.all([r.client.blink(ID), r.client.sprayNow(ID), r.client.refresh(ID)]);
    expect(r.counts.connects).toBe(1);
    const ops = mts(r).filter((m) => m === 113 || m === 104 || m === 109);
    expect(ops).toEqual([113, 104, 109]);
  });

  it('opens a new session after the device drops the link', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    r.t.disconnect(ID);
    await r.client.blink(ID);
    expect(r.counts.connects).toBe(2);
    expect(r.t.state(ID).ledBlinks).toBe(1);
  });

  it('does not retry an operation that failed mid-way', async () => {
    // Writes: 102, 107, 104 (spray applied, link drops, no reply).
    const r = rig({ disconnectAfter: 3 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    expect(await codeOf(r.client.sprayNow(ID))).toBe('disconnected');
    expect(r.t.state(ID).spraysSinceRefill).toBe(1);
  });
});

describe('rename and remove', () => {
  it('renames without connecting', async () => {
    const r = rig();
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    await r.client.rename(ID, 'Lounge');
    expect((await r.store.get(ID))?.name).toBe('Lounge');
    expect(r.counts.connects).toBe(0);
  });

  it('remove closes the open session and then deletes the record', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    await r.client.remove(ID);
    expect(r.counts.disconnects).toBe(1);
    expect(await r.store.get(ID)).toBeNull();
  });

  it('rejects an operation queued after remove and keeps the record gone', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    const removing = r.client.remove(ID);
    const late = codeOf(r.client.sprayNow(ID));
    await removing;
    expect(await late).toBe('unreachable');
    expect(await r.store.get(ID)).toBeNull();
    expect(r.t.state(ID).spraysSinceRefill).toBe(0);
  });
});

describe('fix round 1', () => {
  it('keeps a rename made while the session is opening', async () => {
    const r = rig({ replyDelayMs: 50 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    const refreshing = r.client.refresh(ID);
    await r.client.rename(ID, 'Lounge');
    await refreshing;
    const saved = await r.store.get(ID);
    expect(saved?.name).toBe('Lounge');
    expect(saved?.channels).toBeDefined();
  });

  it('does not connect while the idle disconnect is still in flight', async () => {
    jest.useFakeTimers();
    const r = rig({}, { idleMs: 1000 });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    await r.client.blink(ID);
    let release: () => void = () => undefined;
    r.gate.disconnect = new Promise<void>((resolve) => {
      release = resolve;
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(r.counts.disconnects).toBe(1);
    const next = r.client.blink(ID);
    await jest.advanceTimersByTimeAsync(100);
    expect(r.counts.connects).toBe(1);
    r.gate.disconnect = null;
    release();
    await jest.advanceTimersByTimeAsync(10);
    await next;
    expect(r.counts.connects).toBe(2);
  });

  it('clears stored schedules when recovery after a failed save also fails', async () => {
    jest.useFakeTimers();
    const r = rig({ disconnectAfter: 3 }, { scheduleGapMs: 0 });
    r.gate.busyAfterWrites = 3;
    await r.store.upsert({
      id: ID,
      bleId: ID,
      name: 'Hall',
      homeTimeZone: TZ,
      schedules: { list: [morning], at: NOW.toISOString() },
    });
    const p = codeOf(r.client.saveSchedules(ID, [morning]));
    await jest.advanceTimersByTimeAsync(20000);
    expect(await p).toBe('disconnected');
    expect((await r.store.get(ID))?.schedules).toBeUndefined();
  });

  it('add on an open session still writes the name and time zone', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    const saved = await r.client.add(ID, 'Lounge', 'Europe/London', ID);
    expect(saved.name).toBe('Lounge');
    expect(saved.homeTimeZone).toBe('Europe/London');
    expect(r.counts.connects).toBe(1);
  });

  it('returns the read-back when only the trailing fetch-status fails', async () => {
    // Writes: 102, 107, 108, 103, 109, then 107 is the 6th: drop it.
    jest.useFakeTimers();
    const r = rig({ disconnectAfter: 6 }, { scheduleGapMs: 0, replyTimeoutMs: 500 });
    await r.store.upsert({
      id: ID,
      bleId: ID,
      name: 'Hall',
      homeTimeZone: TZ,
      lastStatus: {
        batteryMv: 1,
        firmware: 'x',
        autoSpray: null,
        scheduleRunning: false,
        spraysSinceRefill: 0,
        at: 'old',
      },
    });
    const p = r.client.saveSchedules(ID, [morning]);
    await jest.advanceTimersByTimeAsync(5000);
    expect(await p).toEqual([morning]);
    expect((await r.store.get(ID))?.schedules?.list).toEqual([morning]);
  });

  it('forgets per-device state after remove', async () => {
    const r = rig();
    await r.client.add(ID, 'Hall', TZ, ID);
    await r.client.remove(ID);
    const devices = (r.client as unknown as { devices: Map<string, unknown> }).devices;
    expect(devices.has(ID)).toBe(false);
  });
});

describe('blink before add', () => {
  it('blinks an unsaved dispenser without writing to the store', async () => {
    const r = rig();
    await r.client.blink(ID, { bleId: ID, homeTimeZone: TZ });
    expect(r.t.state(ID).ledBlinks).toBe(1);
    expect(await r.store.list()).toEqual([]);
  });

  it('add right after blink reuses the session and saves the record', async () => {
    const r = rig();
    await r.client.blink(ID, { bleId: ID, homeTimeZone: TZ });
    const saved = await r.client.add(ID, 'Hall', TZ, ID);
    expect(r.counts.connects).toBe(1);
    expect(saved.name).toBe('Hall');
    expect(saved.homeTimeZone).toBe(TZ);
    expect(saved.channels).toBeDefined();
    expect(saved.lastStatus?.batteryMv).toBe(3000);
    expect(saved.clockSet).toBe(true);
    expect(await r.store.list()).toHaveLength(1);
  });

  it('closes a blinked-but-never-added session on idle and stores nothing', async () => {
    jest.useFakeTimers();
    const r = rig({}, { idleMs: 10000 });
    await r.client.blink(ID, { bleId: ID, homeTimeZone: TZ });
    await jest.advanceTimersByTimeAsync(10000);
    expect(r.counts.disconnects).toBe(1);
    expect(await r.store.list()).toEqual([]);
    jest.useRealTimers();
  });

  it('still rejects an unknown dispenser when no time zone is given', async () => {
    const r = rig();
    expect(await codeOf(r.client.blink('nope'))).toBe('unreachable');
  });

  const tracked = (c: DispenserClient): number =>
    (c as unknown as { devices: Map<string, unknown> }).devices.size;

  it('forgets a blinked unsaved device once it closes on idle', async () => {
    jest.useFakeTimers();
    try {
      const r = rig({}, { idleMs: 10000 });
      await r.client.blink(ID, { bleId: ID, homeTimeZone: TZ });
      expect(tracked(r.client)).toBe(1);
      await jest.advanceTimersByTimeAsync(10000);
      expect(r.counts.disconnects).toBe(1);
      expect(tracked(r.client)).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps tracking a saved device after idle close', async () => {
    jest.useFakeTimers();
    try {
      const r = rig({}, { idleMs: 10000 });
      await r.client.add(ID, 'Hall', TZ, ID);
      await jest.advanceTimersByTimeAsync(10000);
      expect(tracked(r.client)).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('add after the blink session idled out opens fresh and stores the record', async () => {
    jest.useFakeTimers();
    try {
      const r = rig({}, { idleMs: 10000 });
      await r.client.blink(ID, { bleId: ID, homeTimeZone: TZ });
      await jest.advanceTimersByTimeAsync(10000);
      const saved = await r.client.add(ID, 'Hall', TZ, ID);
      expect(r.counts.connects).toBe(2);
      expect(saved.name).toBe('Hall');
      expect(await r.store.list()).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('blink d1 then add d2 closes d1 on idle and stores nothing for it', async () => {
    jest.useFakeTimers();
    try {
      const t = createFakeTransport({ d1: {}, d2: {} });
      const store = createMemoryDispenserStore();
      const client = new DispenserClient(t, store, { now: () => NOW, idleMs: 10000 });
      await client.blink('d1', { bleId: 'd1', homeTimeZone: TZ });
      await client.add('d2', 'Two', TZ, 'd2');
      await jest.advanceTimersByTimeAsync(10000);
      expect((await store.list()).map((d) => d.id)).toEqual(['d2']);
      expect(t.state('d1').ledBlinks).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rename and remove on a blinked unsaved id write nothing and do not throw', async () => {
    const r = rig();
    const upsert = jest.spyOn(r.store, 'upsert');
    const remove = jest.spyOn(r.store, 'remove');
    await r.client.blink(ID, { bleId: ID, homeTimeZone: TZ });
    await expect(r.client.rename(ID, 'X')).resolves.toBeUndefined();
    await expect(r.client.remove(ID)).resolves.toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(r.counts.disconnects).toBe(1);
    expect(await r.store.list()).toEqual([]);
  });
});

describe('setHomeTimeZone', () => {
  it('stores the zone without connecting', async () => {
    const r = rig();
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: 'UTC' });
    await r.client.setHomeTimeZone(ID, 'Europe/London');
    expect((await r.store.get(ID))?.homeTimeZone).toBe('Europe/London');
    expect(r.counts.connects).toBe(0);
  });

  it('rejects an invalid zone and leaves the record alone', async () => {
    const r = rig();
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: 'UTC' });
    await expect(r.client.setHomeTimeZone(ID, 'Not/AZone')).rejects.toMatchObject({
      name: 'AerError',
      code: 'timeZone',
    });
    expect((await r.store.get(ID))?.homeTimeZone).toBe('UTC');
  });

  it('sends the new zone on the next connect, even after a session was open', async () => {
    const r = rig();
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: 'UTC' });
    await r.client.refresh(ID);
    expect(r.t.state(ID).tz).toBe(0);
    await r.client.setHomeTimeZone(ID, 'Asia/Kolkata');
    await r.client.refresh(ID);
    expect(r.t.state(ID).tz).toBe(-330);
    await r.client.remove(ID);
  });

  it('opens the session on bleId, not on the store key', async () => {
    const t = createFakeTransport({ 'AA:01': {} });
    const store = createMemoryDispenserStore();
    await store.upsert({ id: 'dev-1', bleId: 'AA:01', name: 'Hall', homeTimeZone: TZ });
    const client = new DispenserClient(t, store, { now: () => NOW, idleMs: 200 });
    await expect(client.refresh('dev-1')).resolves.toBeDefined();
    expect(t.state('AA:01').time).toBeDefined();
    await client.remove('dev-1');
  });

  it('reports busy when every connect is refused', async () => {
    const r = rig({ refuses: true });
    await r.store.upsert({ id: ID, bleId: ID, name: 'Hall', homeTimeZone: TZ });
    expect(await codeOf(r.client.sprayNow(ID))).toBe('busy');
  });
});
