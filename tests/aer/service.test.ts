import { AerError } from '@/aer/errors';
import { createAer } from '@/aer/service';
import { AER_CACHE_KEY } from '@/aer/store';
import { createFakeTransport } from '@/aer/testing/fakeDispenser';
import type { FoundAer } from '@/aer/types';
import type { Device } from '@/core';
import { createMemoryStore } from '@/store/memoryStore';
import { StoreError, type AsyncStorageLike } from '@/store/types';
import type { BleTransport } from '@/transport/ble/transport';

const NOW = new Date('2026-10-26T10:00:00Z');
const BLE = 'AA:01';

const memStorage = (): AsyncStorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
};

const device = (id = 'd1', bleId = BLE, timeZone = 'Asia/Kolkata'): Device => ({
  id,
  kind: 'aer',
  name: 'Hall',
  roomId: 'r1',
  order: 0,
  links: [{ kind: 'aer', bleId, timeZone }],
});

const rig = async (
  fakes: Record<string, { refuses?: boolean }> = { [BLE]: {} },
  wrap: (t: BleTransport) => BleTransport = (t) => t,
) => {
  const home = createMemoryStore();
  await home.upsertRoom({ id: 'r1', name: 'Living', order: 0 });
  const storage = memStorage();
  const t = createFakeTransport(fakes);
  const aer = createAer({
    transport: wrap(t),
    home,
    storage,
    supported: true,
    client: { idleMs: 200 },
    now: () => NOW,
  });
  await aer.start();
  return { home, storage, t, ...aer };
};

describe('createAer', () => {
  it('adds a dispenser only after it answered', async () => {
    const refusing = await rig({ [BLE]: { refuses: true } });
    await expect(refusing.service.add(device())).rejects.toMatchObject({ code: 'busy' });
    expect(await refusing.home.devices()).toEqual([]);

    const ok = await rig();
    await ok.service.add(device());
    const [saved] = await ok.home.devices();
    const link = saved?.links[0];
    expect(link?.kind === 'aer' && link.channels).toBeTruthy();
    expect(ok.service.view('d1').status).toBeDefined();
    await ok.service.closeAll();
  });

  it('rejects add and saves nothing when the room is missing', async () => {
    const r = await rig();
    await expect(r.service.add({ ...device(), roomId: 'nope' })).rejects.toBeInstanceOf(StoreError);
    expect(await r.home.devices()).toEqual([]);
    expect(r.service.view('d1').status).toBeUndefined();
    await r.service.closeAll();
  });

  it('scan hides added dispensers and repeats', async () => {
    const twice = (t: BleTransport): BleTransport => ({
      ...t,
      adapterState: () => t.adapterState(),
      requestPermissions: () => t.requestPermissions(),
      connect: (id, ms) => t.connect(id, ms),
      scan: (cb, ms) =>
        t.scan((d) => {
          cb(d);
          cb(d);
        }, ms),
    });
    const r = await rig({ 'AA:01': {}, 'AA:02': {} }, twice);
    await r.home.upsertDevice(device('d1', 'AA:01'));
    const found: FoundAer[] = [];
    await r.service.scan((d) => found.push(d), 1000).done;
    expect(found).toEqual([{ bleId: 'AA:02', name: 'Smart Matic', rssi: -60 }]);
  });

  it('scan still reports when the saved ids cannot be read', async () => {
    const r = await rig({ 'AA:01': {}, 'AA:02': {} });
    r.home.devices = async () => {
      throw new Error('storage down');
    };
    const found: FoundAer[] = [];
    await r.service.scan((d) => found.push(d), 1000).done;
    expect(found.map((d) => d.bleId)).toEqual(['AA:01', 'AA:02']);
  });

  it('scan keeps reporting when a listener throws', async () => {
    const r = await rig({ 'AA:01': {}, 'AA:02': {} });
    const found: string[] = [];
    await r.service.scan((d) => {
      found.push(d.bleId);
      if (d.bleId === 'AA:01') throw new Error('listener failed');
    }, 1000).done;
    expect(found).toEqual(['AA:01', 'AA:02']);
  });

  it('blink before adding stores nothing', async () => {
    const r = await rig();
    await r.service.blink('new', { bleId: BLE, timeZone: 'Asia/Kolkata' });
    expect(r.t.state(BLE).ledBlinks).toBe(1);
    expect(await r.home.devices()).toEqual([]);
    expect(r.storage.data.get(AER_CACHE_KEY)).toBeUndefined();
    await r.service.closeAll();
  });

  it('setTimeZone writes the link and reconnects', async () => {
    const r = await rig();
    await r.service.add(device());
    await r.service.refresh('d1');
    expect(r.t.state(BLE).tz).toBe(-330);
    await r.service.setTimeZone('d1', 'Asia/Tokyo');
    const [saved] = await r.home.devices();
    expect(saved?.links[0]).toMatchObject({ timeZone: 'Asia/Tokyo' });
    await r.service.refresh('d1');
    expect(r.t.state(BLE).tz).toBe(-540);
    await r.service.closeAll();
  });

  it('setTimeZone rejects an unknown zone', async () => {
    const r = await rig();
    await r.service.add(device());
    await expect(r.service.setTimeZone('d1', 'Nowhere/Land')).rejects.toBeInstanceOf(AerError);
    await r.service.closeAll();
  });

  it('forget drops the cache, the home device and the session', async () => {
    const r = await rig();
    await r.service.add(device());
    await r.service.refresh('d1');
    expect(r.service.view('d1').status).toBeDefined();
    await r.service.forget('d1');
    expect(await r.home.devices()).toEqual([]);
    expect(r.service.view('d1').status).toBeUndefined();
    expect(JSON.parse(r.storage.data.get(AER_CACHE_KEY) ?? '{}')).not.toHaveProperty('d1');
    // The session is closed: a fresh connect is allowed again.
    await expect(r.t.connect(BLE, 1000)).resolves.toBeDefined();
  });

  it('refresh returns the store view, the same object until the reading changes', async () => {
    const r = await rig();
    await r.service.add(device());
    const v = await r.service.refresh('d1');
    expect(v).toBe(r.service.view('d1'));
    expect(v.schedules).toBeDefined();
    const seen: unknown[] = [];
    const off = r.service.subscribe('d1', (x) => seen.push(x));
    await r.service.sprayNow('d1');
    expect(seen.length).toBeGreaterThan(0);
    off();
    await r.service.closeAll();
  });

  it('passes the commands through', async () => {
    const r = await rig();
    await r.service.add(device());
    expect((await r.service.setAutoSpray('d1', 20)).autoSpray).toBe(20);
    expect((await r.service.setAutoSpray('d1', null)).autoSpray).toBeNull();
    expect((await r.service.resetRefill('d1')).spraysSinceRefill).toBe(0);
    const list = [
      { start: { h: 8, m: 0 }, end: { h: 9, m: 0 }, days: ['mon' as const], interval: 20 as const },
    ];
    expect(await r.service.saveSchedules('d1', list)).toEqual(list);
    await r.service.closeAll();
  }, 15000);

  it('reports supported()', async () => {
    const r = await rig();
    expect(r.service.supported()).toBe(true);
    const off = createAer({
      transport: r.t,
      home: r.home,
      storage: r.storage,
      supported: false,
    });
    expect(off.service.supported()).toBe(false);
  });

  it('start() loads the cache so view(id).status is present for an earlier reading', async () => {
    const home = createMemoryStore();
    const storage = memStorage();
    const status = {
      batteryMv: 3000,
      firmware: '1.0',
      autoSpray: null,
      scheduleRunning: false,
      spraysSinceRefill: 3,
      at: '2026-10-26T10:00:00.000Z',
    };
    storage.data.set(AER_CACHE_KEY, JSON.stringify({ d1: { status } }));
    const aer = createAer({
      transport: createFakeTransport({}),
      home,
      storage,
      supported: true,
    });
    await aer.start();
    expect(aer.service.view('d1').status).toEqual(status);
    expect(aer.dispenserStore).toBe(aer.aerStore);
  });
});
