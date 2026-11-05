import type { AerView } from '@/aer/types';
import { AerError } from '@/aer/errors';
import { createFakeAerService } from '@/aer/testing/fakeAerService';
import { createFakeAlerts } from '@/aer/testing/fakeAlerts';
import { createMemoryDispenserStore } from '@/aer/testing/memoryDispenserStore';
import type { Device } from '@/core';
import { createMemoryStore } from '@/store/memoryStore';

const aerDevice: Device = {
  id: 'd1',
  kind: 'aer',
  name: 'Air freshener',
  roomId: 'r',
  order: 0,
  links: [{ kind: 'aer', bleId: 'AA:BB', timeZone: 'Asia/Kolkata' }],
};

describe('fake aer service', () => {
  it('records calls and fails on demand', async () => {
    const aer = createFakeAerService();
    aer.failNext('sprayNow', new AerError('unreachable'));
    await expect(aer.sprayNow('d1')).rejects.toMatchObject({ code: 'unreachable' });
    await expect(aer.sprayNow('d1')).resolves.toMatchObject({ autoSpray: null });
    await aer.closeAll();
    expect(aer.calls.map((c) => c.op)).toEqual(['sprayNow', 'sprayNow', 'closeAll']);
    expect(aer.calls[0]).toEqual({ op: 'sprayNow', deviceId: 'd1' });
  });

  it('writes the added device to the home store', async () => {
    const home = createMemoryStore();
    await home.upsertRoom({ id: 'r', name: 'R', order: 0 });
    const aer = createFakeAerService({ home });
    await aer.add(aerDevice);
    expect(await home.devices()).toEqual([aerDevice]);
    expect(aer.calls).toEqual([{ op: 'add', deviceId: 'd1', arg: aerDevice }]);
  });

  it('keeps held operations pending until released', async () => {
    const aer = createFakeAerService();
    const held = aer.hold('refresh');
    let settled = false;
    const p = aer.refresh('d1').then((v) => {
      settled = true;
      return v;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    held.release();
    await expect(p).resolves.toEqual({ deviceId: 'd1' });
  });

  it('answers saveSchedules with the given list unless setView set others', async () => {
    const aer = createFakeAerService();
    const s = {
      start: { h: 6, m: 0 },
      end: { h: 8, m: 0 },
      days: ['mon' as const],
      interval: 20 as const,
    };
    await expect(aer.saveSchedules('d1', [s])).resolves.toEqual([s]);
    const other = { ...s, interval: 40 as const };
    aer.setView({ deviceId: 'd2', schedules: { list: [other], at: '2026-11-04T00:00:00Z' } });
    await expect(aer.saveSchedules('d2', [s])).resolves.toEqual([other]);
  });

  it('tells subscribers about setView and scans the found list', async () => {
    const aer = createFakeAerService({ found: [{ bleId: 'x', name: 'Smart Matic', rssi: -50 }] });
    const seen: string[] = [];
    const off = aer.subscribe('d1', (v) => seen.push(v.deviceId));
    aer.setView({ deviceId: 'd1', clockSet: true });
    off();
    aer.setView({ deviceId: 'd1' });
    expect(seen).toEqual(['d1']);
    const found: string[] = [];
    await aer.scan((d) => found.push(d.bleId), 1000).done;
    expect(found).toEqual(['x']);
  });
});

describe('fake alerts', () => {
  it('counts start and stop and plays taps', () => {
    const alerts = createFakeAlerts();
    const opened: (string | null)[] = [];
    alerts.onOpen((id) => opened.push(id));
    const stop = alerts.start();
    expect([alerts.startCalls, alerts.stopCalls]).toEqual([1, 0]);
    stop();
    expect(alerts.stopCalls).toBe(1);
    alerts.opened('d1');
    alerts.opened(null);
    expect(opened).toEqual(['d1', null]);
  });

  it('keeps switches and the permission it was given', async () => {
    const alerts = createFakeAlerts({ permission: 'denied', switches: { battery: false } });
    expect(await alerts.permission()).toBe('denied');
    await alerts.setSwitch('refill', false);
    expect(await alerts.switches()).toEqual({ refill: false, battery: false, checkIn: true });
  });
});

describe('memory dispenser store', () => {
  it('stores copies and tells subscribers', async () => {
    const store = createMemoryDispenserStore();
    let n = 0;
    store.subscribe(() => (n += 1));
    await store.upsert({ id: 'd1', bleId: 'x', name: 'A', homeTimeZone: 'UTC' });
    expect((await store.get('d1'))?.name).toBe('A');
    await store.remove('d1');
    expect(await store.list()).toEqual([]);
    expect(n).toBe(2);
  });
});

describe('fake scan with a home store', () => {
  it('skips dispensers already added', async () => {
    const home = createMemoryStore();
    await home.upsertRoom({ id: 'r', name: 'R', order: 0 });
    await home.upsertDevice(aerDevice);
    const aer = createFakeAerService({
      home,
      found: [
        { bleId: 'AA:BB', name: 'Smart Matic', rssi: -40 },
        { bleId: 'CC:DD', name: 'Smart Matic', rssi: -60 },
      ],
    });
    const found: string[] = [];
    await aer.scan((d) => found.push(d.bleId), 1000).done;
    expect(found).toEqual(['CC:DD']);
  });

  it('notifies on forget and stamps a new reading on sprayNow', async () => {
    const aer = createFakeAerService({ views: { d1: { deviceId: 'd1' } } });
    const seen: AerView[] = [];
    aer.subscribe('d1', (v) => seen.push(v));
    await aer.sprayNow('d1');
    expect(seen[0]?.status?.at).toEqual(expect.any(String));
    await aer.forget('d1');
    expect(seen[1]).toEqual({ deviceId: 'd1' });
    expect(aer.view('d1')).toEqual({ deviceId: 'd1' });
  });
});
