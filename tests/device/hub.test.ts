import type { AcState, Command, Device, LinkDriver, VoiceSession } from '@/core';
import { DeviceError, defaultAcState } from '@/core';
import type { DeviceView as View } from '@/device/hub';
import { DeviceHub } from '@/device/hub';
import type { FakeDriver } from '@/device/testing/fakeDriver';
import { createFakeDriver } from '@/device/testing/fakeDriver';

const acState: AcState = { ...defaultAcState(), power: true, setpoint: 22 };
const acSet: Command = { kind: 'ac.set', state: acState };
const okKey: Command = { kind: 'tv.key', key: 'ok' };

const ac: Device = {
  id: 'ac1',
  kind: 'ac',
  name: 'Bedroom AC',
  roomId: 'r1',
  order: 0,
  links: [
    { kind: 'matter', nodeId: 'n1' },
    { kind: 'ir', remoteId: 'panasonic-ac/dke' },
  ],
};
const tv: Device = {
  id: 'tv1',
  kind: 'tv',
  name: 'LG TV',
  roomId: 'r1',
  order: 1,
  links: [
    { kind: 'webos', host: '192.168.1.20', secure: true, clientKeyRef: 'k' },
    { kind: 'ir', remoteId: 'lg-tv/akb' },
  ],
};
const irFan: Device = {
  id: 'fan1',
  kind: 'fan',
  name: 'Fan',
  roomId: 'r1',
  order: 2,
  links: [{ kind: 'ir', remoteId: 'havells/fan' }],
};

/** IR has no live state: strip the fake's observe. */
function withoutObserve(d: FakeDriver): LinkDriver {
  return {
    kind: d.kind,
    available: d.available,
    supports: d.supports,
    capabilities: d.capabilities,
    send: d.send,
  };
}

function codeOf(e: unknown): string | undefined {
  return e instanceof DeviceError ? e.code : undefined;
}

function setup(opts: { irAvailable?: boolean; irObserves?: boolean } = {}): {
  hub: DeviceHub;
  webos: FakeDriver;
  matter: FakeDriver;
  ir: FakeDriver;
  clock: { t: number };
} {
  const webos = createFakeDriver('webos');
  const matter = createFakeDriver('matter', { capabilities: { swing: true } });
  const ir = createFakeDriver('ir', { available: opts.irAvailable ?? true });
  const clock = { t: 0 };
  const hub = new DeviceHub({
    drivers: [webos, matter, opts.irObserves ? ir : withoutObserve(ir)],
    now: () => clock.t,
  });
  hub.setDevices([ac, tv, irFan]);
  return { hub, webos, matter, ir, clock };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('DeviceHub', () => {
  it('sends on the first link', async () => {
    const { hub, matter, ir } = setup();
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'matter', fellBack: false });
    expect(matter.sent).toEqual([{ deviceId: 'ac1', cmd: acSet }]);
    expect(ir.sent).toHaveLength(0);
    expect(hub.view('ac1').status).toEqual({ via: 'matter', fellBack: false });
  });

  it('falls back on notSent', async () => {
    const { hub, matter, ir } = setup();
    matter.failNext('notSent');
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(ir.sent).toHaveLength(1);
    expect(hub.view('ac1').status).toEqual({ via: 'ir', fellBack: true });
  });

  it('does not resend a non-idempotent key after timeout', async () => {
    const { hub, webos, ir } = setup();
    webos.failNext('timeout');
    const err = await hub.send('tv1', okKey).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('timeout');
    expect(ir.sent).toHaveLength(0);
    expect(hub.view('tv1').status).toEqual({ via: null, fellBack: false, problem: 'timeout' });
  });

  it('falls back on timeout for idempotent ac.set', async () => {
    const { hub, matter, ir } = setup();
    matter.failNext('timeout');
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(ir.sent).toEqual([{ deviceId: 'ac1', cmd: acSet }]);
  });

  it('times out a hung idempotent send, then falls back', async () => {
    const { hub, matter, ir } = setup();
    matter.hangNext();
    const p = hub.send('ac1', acSet);
    await jest.advanceTimersByTimeAsync(1999);
    expect(ir.sent).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(ir.sent).toHaveLength(1);
  });

  it('times out a hung key press and does not resend it', async () => {
    const { hub, webos, ir } = setup();
    webos.hangNext();
    const p = hub.send('tv1', okKey).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(2000);
    expect(codeOf(await p)).toBe('timeout');
    expect(ir.sent).toHaveLength(0);
  });

  it('aborts the signal it gave a send when the timeout fires', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const slow: LinkDriver = {
      ...createFakeDriver('webos'),
      send: (_d, _l, _c, signal) => {
        signals.push(signal);
        return new Promise<void>(() => undefined);
      },
    };
    const hub = new DeviceHub({ drivers: [slow] });
    hub.setDevices([tv]);
    const p = hub.send('tv1', okKey).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(1999);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(codeOf(await p)).toBe('timeout');
    expect(signals[0]?.aborted).toBe(true);
    expect(codeOf(signals[0]?.reason)).toBe('timeout');
  });

  it('treats a driver that throws synchronously like a rejected send', async () => {
    const thrower: LinkDriver = {
      ...createFakeDriver('webos'),
      send: () => {
        throw new DeviceError('notSent');
      },
    };
    const ir = createFakeDriver('ir');
    const hub = new DeviceHub({ drivers: [thrower, ir] });
    hub.setDevices([tv]);
    await expect(hub.send('tv1', okKey)).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(ir.sent).toHaveLength(1);
  });

  it('does not abort a send that settles in time', async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const quick: LinkDriver = {
      ...createFakeDriver('webos'),
      send: (_d, _l, _c, signal) => {
        signals.push(signal);
        return Promise.resolve();
      },
    };
    const hub = new DeviceHub({ drivers: [quick] });
    hub.setDevices([tv]);
    await hub.send('tv1', okKey);
    await jest.advanceTimersByTimeAsync(5000);
    expect(signals[0]?.aborted).toBe(false);
  });

  it('backs off a failed link, then retries it', async () => {
    const { hub, matter, ir, clock } = setup();
    matter.failNext('notSent');
    await hub.send('ac1', acSet);
    expect(ir.sent).toHaveLength(1);

    clock.t = 999;
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(matter.sent).toHaveLength(0);
    expect(ir.sent).toHaveLength(2);

    clock.t = 1001;
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'matter', fellBack: false });
    expect(matter.sent).toHaveLength(1);
  });

  it('grows the backoff on consecutive failures and resets it on success', async () => {
    const { hub, matter, clock } = setup();
    matter.failNext('notSent');
    await hub.send('ac1', acSet); // blocked until 1000
    clock.t = 1000;
    matter.failNext('notSent');
    await hub.send('ac1', acSet); // second failure: blocked until 3000
    clock.t = 2999;
    await hub.send('ac1', acSet);
    expect(matter.sent).toHaveLength(0);
    clock.t = 3000;
    await hub.send('ac1', acSet); // success resets
    expect(matter.sent).toHaveLength(1);
    matter.failNext('notSent');
    await hub.send('ac1', acSet); // first failure again: blocked for 1000
    clock.t = 4000;
    await hub.send('ac1', acSet);
    expect(matter.sent).toHaveLength(2);
  });

  it('tries the link whose backoff ends soonest when every link is backing off', async () => {
    const { hub, matter, ir, clock } = setup();
    matter.failNext('notSent');
    await hub.send('ac1', acSet); // matter blocked until 1000
    clock.t = 1000;
    matter.failNext('notSent');
    ir.failNext('notSent');
    const err = await hub.send('ac1', acSet).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('notSent');
    expect(hub.view('ac1').status.problem).toBe('notSent');
    // matter is blocked until 3000 (second step), IR only until 2000.
    clock.t = 1010;
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(matter.sent).toHaveLength(0);
  });

  it('rethrows other codes without falling back', async () => {
    const { hub, webos, ir } = setup();
    webos.failNext('unsupported');
    const err = await hub.send('tv1', { kind: 'tv.powerOn' }).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('unsupported');
    expect(ir.sent).toHaveLength(0);
  });

  it('no IR phone', async () => {
    const { hub } = setup({ irAvailable: false });
    expect(hub.view('fan1').usable).toBe(false);
    const err = await hub
      .send('fan1', {
        kind: 'fan.set',
        state: { power: true, speed: 3, boost: false, sleep: false, timerHours: 0 },
      })
      .catch((e: unknown) => e);
    expect(codeOf(err)).toBe('noIrEmitter');
    expect(hub.view('ac1').usable).toBe(true);
  });

  it('rejects noLink when no link supports the command', async () => {
    const webos = createFakeDriver('webos', { supports: () => false });
    const hub = new DeviceHub({ drivers: [webos] });
    hub.setDevices([tv]);
    const err = await hub.send('tv1', okKey).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('noLink');
    expect(hub.view('tv1').status.problem).toBe('noLink');
  });

  it('throws noLink for unknown devices', async () => {
    const { hub } = setup();
    expect(() => hub.view('nope')).toThrow(DeviceError);
    expect(() => hub.subscribe('nope', () => undefined)).toThrow(DeviceError);
    expect(codeOf(await hub.send('nope', okKey).catch((e: unknown) => e))).toBe('noLink');
  });

  it('takes capabilities from the first available link', () => {
    const { hub, matter } = setup();
    expect(hub.view('ac1').capabilities).toEqual({ swing: true });
    matter.setAvailable(false);
    expect(hub.view('ac1').capabilities).toEqual({});
  });

  it('last sent state', async () => {
    const { hub, matter } = setup();
    matter.failNext('notSent');
    await hub.send('ac1', acSet);
    expect(hub.view('ac1').state).toEqual({ kind: 'ac', state: acState, lastSent: true });

    const fan = { power: true, speed: 2, boost: false, sleep: false, timerHours: 0 } as const;
    await hub.send('fan1', { kind: 'fan.set', state: fan });
    expect(hub.view('fan1').state).toEqual({ kind: 'fan', state: fan, lastSent: true });
  });

  it('does not store last sent state over a link that reports', async () => {
    const { hub } = setup();
    await hub.send('ac1', acSet);
    expect(hub.view('ac1').state).toBeUndefined();
  });

  it('forgets a reported state once no one watches, so a later look does not show it as live', async () => {
    const { hub, matter } = setup();
    const stop = hub.subscribe('ac1', () => undefined);
    matter.emit('ac1', { kind: 'ac', state: acState, roomTemp: 27 });
    expect(hub.view('ac1').state).toBeDefined();
    stop();
    expect(hub.view('ac1').state).toBeUndefined();
  });

  it('reported state wins', async () => {
    const { hub, matter } = setup();
    const views: View[] = [];
    const stop = hub.subscribe('ac1', (v) => views.push(v));
    matter.emit('ac1', { kind: 'ac', state: acState, roomTemp: 27 });
    expect(views).toHaveLength(1);
    const state = hub.view('ac1').state;
    expect(state).toEqual({ kind: 'ac', state: acState, roomTemp: 27 });
    expect(state && 'roomTemp' in state ? state.roomTemp : undefined).toBe(27);

    await hub.send('ac1', acSet);
    expect(views).toHaveLength(2);
    expect(views[1]?.status.via).toBe('matter');

    stop();
    stop();
    matter.emit('ac1', { kind: 'ac', state: acState, roomTemp: 30 });
    expect(views).toHaveLength(2);
  });

  it('observes once per device and stops when the last subscriber leaves', () => {
    const { hub, matter } = setup({ irObserves: true });
    const a = jest.fn();
    const b = jest.fn();
    const stopA = hub.subscribe('ac1', a);
    const stopB = hub.subscribe('ac1', b);
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(b).toHaveBeenCalledTimes(2);
    stopB();
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('re-observes subscribed devices after setDevices', () => {
    const { hub, matter } = setup();
    const cb = jest.fn();
    hub.subscribe('ac1', cb);
    hub.setDevices([{ ...ac, name: 'Renamed' }]);
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(cb).toHaveBeenCalledTimes(1);
    expect((cb.mock.calls[0]?.[0] as View).device.name).toBe('Renamed');
    expect(() => hub.view('tv1')).toThrow(DeviceError);
  });

  it('serialises sends to one device', async () => {
    const { hub, webos, ir } = setup();
    const order: string[] = [];
    webos.hangNext();
    const first = hub.send('tv1', okKey).catch((e: unknown) => {
      order.push('first');
      return e;
    });
    const second = hub.send('tv1', { kind: 'tv.key', key: 'down' }).then((r) => {
      order.push('second');
      return r;
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(webos.sent).toHaveLength(0);
    expect(ir.sent).toHaveLength(0);
    // Another device is not held up.
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'matter', fellBack: false });
    await jest.advanceTimersByTimeAsync(1000);
    expect(codeOf(await first)).toBe('timeout');
    // webos is now backing off, so the next press goes over IR, after the first one settled.
    await expect(second).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(order).toEqual(['first', 'second']);
    expect(ir.sent.map((s) => s.cmd)).toEqual([{ kind: 'tv.key', key: 'down' }]);
  });

  it('keeps going when a subscriber throws, and send still resolves', async () => {
    const { hub, matter } = setup();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const second = jest.fn();
    hub.subscribe('ac1', () => {
      throw new Error('boom');
    });
    hub.subscribe('ac1', second);
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'matter', fellBack: false });
    expect(second).toHaveBeenCalledTimes(1);
    matter.emit('ac1', { kind: 'ac', state: acState, roomTemp: 25 });
    expect(second).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('rolls back and can retry when observe throws', () => {
    const webos = createFakeDriver('webos');
    const matter = createFakeDriver('matter');
    const realObserve = matter.observe;
    let broken = true;
    const flaky: LinkDriver = {
      ...withoutObserve(matter),
      observe: (d, l, cb) => {
        if (broken) throw new Error('observe failed');
        return realObserve(d, l, cb);
      },
    };
    const stopWebos = jest.fn();
    const tracked: LinkDriver = {
      ...withoutObserve(webos),
      kind: 'webos',
      observe: () => stopWebos,
    };
    const hub = new DeviceHub({ drivers: [tracked, flaky] });
    const dev: Device = { ...ac, links: [tv.links[0] as Device['links'][number], ...ac.links] };
    hub.setDevices([dev]);
    const cb = jest.fn();
    expect(() => hub.subscribe('ac1', cb)).toThrow('observe failed');
    expect(stopWebos).toHaveBeenCalledTimes(1);

    broken = false;
    hub.subscribe('ac1', cb);
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(cb).toHaveBeenCalledTimes(1);

    // A failing re-observe in setDevices is logged, not thrown.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    broken = true;
    expect(() => hub.setDevices([dev])).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('keys backoff by link kind, so reordering links keeps it', async () => {
    const { hub, matter, ir, clock } = setup();
    matter.failNext('notSent');
    await hub.send('ac1', acSet); // matter blocked until 1000
    hub.setDevices([{ ...ac, links: [...ac.links].reverse() }]); // [ir, matter]
    clock.t = 500;
    // Keyed by index, slot 0 (now IR) would be blocked and matter tried.
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'ir', fellBack: false });
    expect(matter.sent).toHaveLength(0);
    expect(ir.sent).toHaveLength(2);
  });

  it('forgets devices that setDevices removes', async () => {
    const { hub, matter } = setup();
    matter.failNext('notSent');
    await hub.send('ac1', acSet);
    expect(hub.view('ac1').state).toBeDefined();
    hub.setDevices([tv]);
    hub.setDevices([ac, tv]);
    const v = hub.view('ac1');
    expect(v.status).toEqual({ via: null, fellBack: false });
    expect(v.state).toBeUndefined();
    // Backoff was forgotten too: matter is tried first again.
    await expect(hub.send('ac1', acSet)).resolves.toEqual({ via: 'matter', fellBack: false });
  });

  it('does not write status for a device removed mid-flight', async () => {
    const { hub, matter } = setup();
    matter.hangNext();
    const p = hub.send('ac1', acSet);
    await jest.advanceTimersByTimeAsync(100);
    hub.setDevices([tv]);
    await jest.advanceTimersByTimeAsync(1900);
    await expect(p).resolves.toEqual({ via: 'ir', fellBack: true });
    hub.setDevices([ac, tv]);
    expect(hub.view('ac1').status).toEqual({ via: null, fellBack: false });
    expect(hub.view('ac1').state).toBeUndefined();
  });

  it('leaves no timers behind after a send settles', async () => {
    const { hub, webos } = setup();
    await hub.send('ac1', acSet);
    webos.failNext('notSent');
    await hub.send('tv1', okKey);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts observing on a driver that became available after subscribe, via refresh()', () => {
    const { hub, matter } = setup();
    matter.setAvailable(false);
    const cb = jest.fn();
    hub.subscribe('ac1', cb);
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(cb).not.toHaveBeenCalled();
    matter.setAvailable(true);
    hub.refresh();
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(cb).toHaveBeenCalledTimes(1);
    hub.refresh(); // idempotent: still one observer
    matter.emit('ac1', { kind: 'ac', state: acState });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('treats notLocal like notSent: nothing went out, so the press falls back to the next link', async () => {
    const { hub, webos, ir } = setup();
    webos.failNext('notLocal');
    await expect(hub.send('tv1', okKey)).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(ir.sent).toHaveLength(1);
  });

  it('treats notPaired like notSent: nothing went out, so a key press falls back', async () => {
    const { hub, webos, ir } = setup();
    webos.failNext('notPaired');
    await expect(hub.send('tv1', okKey)).resolves.toEqual({ via: 'ir', fellBack: true });
    expect(ir.sent).toHaveLength(1);
  });

  it('never resends a tv.key after a timeout', async () => {
    const { hub, webos, ir } = setup();
    webos.failNext('timeout');
    await expect(hub.send('tv1', okKey)).rejects.toMatchObject({ code: 'timeout' });
    expect(ir.sent).toHaveLength(0);
  });

  it('tells onDevicesChanged listeners after setDevices, until they unsubscribe', () => {
    const { hub } = setup();
    const seen: string[][] = [];
    const stop = hub.onDevicesChanged(() => {
      // The new set is already visible when the listener runs.
      seen.push(
        ['ac1', 'tv1', 'fan1'].filter((id) => {
          try {
            hub.view(id);
            return true;
          } catch {
            return false;
          }
        }),
      );
    });
    hub.setDevices([ac]);
    expect(seen).toEqual([['ac1']]);
    stop();
    hub.setDevices([ac, tv]);
    expect(seen).toHaveLength(1);
  });
});

describe('startVoice', () => {
  const session = (): VoiceSession => ({ push: jest.fn(), end: jest.fn() });

  it('forwards to the first available link whose driver has startVoice', async () => {
    const s = session();
    const start = jest.fn((_d: Device) => Promise.resolve(s));
    const webos = createFakeDriver('webos');
    const ir = createFakeDriver('ir', { startVoice: start });
    const hub = new DeviceHub({ drivers: [webos, ir] });
    hub.setDevices([tv]);
    await expect(hub.startVoice('tv1')).resolves.toBe(s);
    expect(start).toHaveBeenCalledWith(tv);
  });

  it('rejects notSent when no link has a driver with startVoice', async () => {
    const { hub } = setup();
    await expect(hub.startVoice('tv1')).rejects.toMatchObject({ code: 'notSent' });
  });

  it('skips a driver that is not available', async () => {
    const start = jest.fn(() => Promise.resolve(session()));
    const webos = createFakeDriver('webos', { available: false, startVoice: start });
    const hub = new DeviceHub({ drivers: [webos] });
    hub.setDevices([tv]);
    await expect(hub.startVoice('tv1')).rejects.toMatchObject({ code: 'notSent' });
    expect(start).not.toHaveBeenCalled();
  });

  it('passes a DeviceError through and wraps anything else as notSent', async () => {
    let fail: unknown = new DeviceError('notPaired');
    const webos = createFakeDriver('webos', { startVoice: () => Promise.reject(fail) });
    const hub = new DeviceHub({ drivers: [webos] });
    hub.setDevices([tv]);
    await expect(hub.startVoice('tv1')).rejects.toMatchObject({ code: 'notPaired' });
    fail = new Error('boom');
    await expect(hub.startVoice('tv1')).rejects.toMatchObject({ code: 'notSent' });
  });

  it('rejects for an unknown device', async () => {
    const { hub } = setup();
    await expect(hub.startVoice('nope')).rejects.toBeInstanceOf(DeviceError);
  });
});
