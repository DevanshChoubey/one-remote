import type { AcState, Command, Device, FanState, Link } from '@/core';
import { defaultAcState } from '@/core';
import { createIrDriver } from '@/ir/driver';
import { necSignal } from '@/ir/nec';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';

const dev = (kind: Device['kind'], remoteId: string, id = 'd1'): [Device, Link] => {
  const link: Link = { kind: 'ir', remoteId };
  return [{ id, kind, name: id, roomId: 'r', order: 0, links: [link] }, link];
};
const ac = (o: Partial<AcState> = {}): Command => ({
  kind: 'ac.set',
  state: { ...defaultAcState(), power: true, ...o },
});
const fan = (o: Partial<FanState> = {}): Command => ({
  kind: 'fan.set',
  state: { power: true, speed: 3, boost: false, sleep: false, timerHours: 0, ...o },
});

describe('ir driver', () => {
  it('transmits once per press', async () => {
    const emitter = createFakeEmitter();
    const driver = createIrDriver({ emitter });
    const [d, l] = dev('ac', 'panasonic-ac/dke');
    await driver.send(d, l, ac());
    expect(emitter.sent).toHaveLength(1);
    await Promise.all([driver.send(d, l, ac({ setpoint: 25 })), driver.send(d, l, ac())]);
    expect(emitter.sent).toHaveLength(3);
  });

  it('turns an emitter failure into notSent and records nothing', async () => {
    const emitter = createFakeEmitter();
    const driver = createIrDriver({ emitter });
    const [d, l] = dev('ac', 'panasonic-ac/dke');
    emitter.failNext();
    await expect(driver.send(d, l, ac())).rejects.toMatchObject({ code: 'notSent' });
    expect(emitter.sent).toHaveLength(0);
  });

  it('reports no emitter as unavailable and rejects noIrEmitter', async () => {
    const driver = createIrDriver({ emitter: createFakeEmitter({ has: false }) });
    expect(driver.available()).toBe(false);
    const [d, l] = dev('ac', 'panasonic-ac/dke');
    await expect(driver.send(d, l, ac())).rejects.toMatchObject({ code: 'noIrEmitter' });
    expect(createIrDriver({ emitter: createFakeEmitter() }).available()).toBe(true);
    expect(driver.kind).toBe('ir');
  });

  it('wraps a non-DeviceError emitter failure as notSent', async () => {
    const driver = createIrDriver({
      emitter: {
        hasEmitter: () => true,
        transmit: () => Promise.reject(new Error('boom')),
      },
    });
    const [d, l] = dev('ac', 'panasonic-ac/dke');
    await expect(driver.send(d, l, ac())).rejects.toMatchObject({ code: 'notSent' });
  });

  describe('fan keys', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('spaces consecutive keys by at least 200 ms', async () => {
      const emitter = createFakeEmitter();
      const times: number[] = [];
      const spy = jest.spyOn(emitter, 'transmit').mockImplementation(() => {
        times.push(Date.now());
        return Promise.resolve();
      });
      const driver = createIrDriver({ emitter });
      const [d, l] = dev('fan', 'atomberg-fan/1170');
      // Make the last state known: on at speed 3.
      let p = driver.send(d, l, fan());
      await jest.runAllTimersAsync();
      await p;
      times.length = 0;
      // 1170 has no light key, so use speed change plus the boost of 1160 instead.
      const [d2, l2] = dev('fan', 'atomberg-fan/1160', 'd2');
      p = driver.send(d2, l2, fan({ speed: 4 }));
      await jest.runAllTimersAsync();
      await p;
      p = driver.send(d2, l2, fan({ speed: 5, boost: true }));
      await jest.runAllTimersAsync();
      await p;
      expect(spy.mock.calls.length).toBe(4);
      expect(times).toHaveLength(3);
      expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(200);
    });

    it('does not remember the state when a key fails, so the next press starts fresh', async () => {
      const emitter = createFakeEmitter();
      const driver = createIrDriver({ emitter, gapMs: 0 });
      const [d, l] = dev('fan', 'atomberg-fan/1160');
      await driver.send(d, l, fan());
      emitter.sent.length = 0;
      // speed 4 + boost needs two keys; the second fails.
      let n = 0;
      const real = emitter.transmit.bind(emitter);
      jest.spyOn(emitter, 'transmit').mockImplementation((s) => {
        n += 1;
        return n === 2 ? Promise.reject(new Error('x')) : real(s);
      });
      await expect(driver.send(d, l, fan({ speed: 4, boost: true }))).rejects.toMatchObject({
        code: 'notSent',
      });
      // Last state is still "on, speed 3": an identical retry sends speed4 and boost again.
      n = 0;
      jest.spyOn(emitter, 'transmit').mockImplementation((s) => real(s));
      await driver.send(d, l, fan({ speed: 4, boost: true }));
      expect(emitter.sent).toHaveLength(3);
    });

    it('sends nothing when the keys are empty', async () => {
      const emitter = createFakeEmitter();
      const driver = createIrDriver({ emitter, gapMs: 0 });
      const [d, l] = dev('fan', 'atomberg-fan/1170');
      await driver.send(d, l, fan());
      await driver.send(d, l, fan());
      expect(emitter.sent).toHaveLength(1);
    });
  });

  it('sends one NEC signal for a TV power-on', async () => {
    const emitter = createFakeEmitter();
    const driver = createIrDriver({ emitter });
    const [d, l] = dev('tv', 'lg-tv/nec');
    await driver.send(d, l, { kind: 'tv.powerOn' });
    await driver.send(d, l, { kind: 'tv.key', key: 'volumeUp' });
    expect(emitter.sent).toEqual([necSignal(0x20df23dc), necSignal(0x20df40bf)]);
  });

  describe('supports', () => {
    const driver = createIrDriver({ emitter: createFakeEmitter() });
    it('follows the remote kind and keys', () => {
      const [tv, tvl] = dev('tv', 'lg-tv/nec');
      expect(driver.supports(tv, tvl, { kind: 'tv.powerOn' })).toBe(true);
      expect(driver.supports(tv, tvl, { kind: 'tv.key', key: 'power' })).toBe(true);
      expect(driver.supports(tv, tvl, { kind: 'tv.key', key: 'up' })).toBe(false);
      expect(driver.supports(tv, tvl, { kind: 'tv.text', text: 'x' })).toBe(false);
      expect(driver.supports(tv, tvl, ac())).toBe(false);
      const [a, al] = dev('ac', 'panasonic-ac/dke');
      expect(driver.supports(a, al, ac())).toBe(true);
      expect(driver.supports(a, al, fan())).toBe(false);
      const [f, fl] = dev('fan', 'atomberg-fan/1170');
      expect(driver.supports(f, fl, fan())).toBe(true);
    });

    it('is false for unknown remotes and non-ir links', () => {
      const [d, l] = dev('ac', 'nope/1');
      expect(driver.supports(d, l, ac())).toBe(false);
      expect(driver.supports(d, { kind: 'matter', nodeId: 'n' }, ac())).toBe(false);
    });

    it('exposes the remote caps ({} for TV and unknown)', () => {
      const [a, al] = dev('ac', 'panasonic-ac/dke');
      expect(driver.capabilities(a, al).setpoint).toEqual({ min: 16, max: 30 });
      const [t, tl] = dev('tv', 'lg-tv/nec');
      expect(driver.capabilities(t, tl)).toEqual({});
      const [u, ul] = dev('ac', 'nope/1');
      expect(driver.capabilities(u, ul)).toEqual({});
    });
  });

  it('rejects unsupported commands as unsupported', async () => {
    const emitter = createFakeEmitter();
    const driver = createIrDriver({ emitter });
    const [d, l] = dev('tv', 'lg-tv/nec');
    await expect(driver.send(d, l, { kind: 'tv.key', key: 'up' })).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(emitter.sent).toHaveLength(0);
  });
});
