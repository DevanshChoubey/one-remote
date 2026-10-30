import type { AcState, Command, Device, FanState, Link } from '@/core';
import { DeviceError, defaultAcState } from '@/core';
import { createCatalogue, type FanKey } from '@/ir/catalogue';
import { createIrDriver } from '@/ir/driver';
import type { IrSignal } from '@/ir/emitter';
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
    // A fan remote with every key, each with its own signal, so sent signals name the keys.
    const KEYS: FanKey[] = [
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
    ];
    const sigOf = (k: FanKey): IrSignal => ({ freqHz: 38000, pattern: [KEYS.indexOf(k) + 1, 1] });
    const fullKeys = Object.fromEntries(KEYS.map((k) => [k, sigOf(k)])) as Record<FanKey, IrSignal>;
    const catalogue = createCatalogue(
      [{ id: 'test/full', kind: 'fan', brandId: 'test', label: 'Full', caps: {}, keys: fullKeys }],
      [],
    );
    const names = (e: { sent: IrSignal[] }): FanKey[] =>
      e.sent.map((s) => KEYS[(s.pattern[0] ?? 1) - 1] as FanKey);
    const known = (o: Partial<FanState> = {}): FanState => ({
      power: true,
      speed: 3,
      boost: false,
      sleep: false,
      timerHours: 0,
      ...o,
    });
    const setup = (gapMs = 0) => {
      const emitter = createFakeEmitter();
      const driver = createIrDriver({ emitter, catalogue, gapMs });
      const [d, l] = dev('fan', 'test/full');
      return { emitter, driver, d, l };
    };

    describe('spacing', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it('sends the exact keys in order, at least 200 ms apart', async () => {
        const emitter = createFakeEmitter();
        const times: number[] = [];
        const spy = jest.spyOn(emitter, 'transmit').mockImplementation(() => {
          times.push(Date.now());
          return Promise.resolve();
        });
        const driver = createIrDriver({ emitter, catalogue });
        const [d, l] = dev('fan', 'test/full');
        driver.seedFan(d.id, known());
        const p = driver.send(d, l, fan({ speed: 4, boost: true, light: true }));
        await jest.runAllTimersAsync();
        await p;
        expect(spy.mock.calls.map(([s]) => s)).toEqual([
          sigOf('speed4'),
          sigOf('boost'),
          sigOf('light'),
        ]);
        expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(200);
        expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(200);
      });
    });

    it('a failure after some keys went out is partiallySent and memory reflects them', async () => {
      const { emitter, driver, d, l } = setup();
      driver.seedFan(d.id, known());
      const real = emitter.transmit.bind(emitter);
      let n = 0;
      jest.spyOn(emitter, 'transmit').mockImplementation((s) => {
        n += 1;
        return n === 2 ? Promise.reject(new DeviceError('notSent')) : real(s);
      });
      await expect(driver.send(d, l, fan({ boost: true, sleep: true }))).rejects.toMatchObject({
        code: 'partiallySent',
      });
      expect(names(emitter)).toEqual(['boost']);
      // Boost is remembered as on, so the same press now sends only sleep.
      await driver.send(d, l, fan({ boost: true, sleep: true }));
      expect(names(emitter)).toEqual(['boost', 'sleep']);
    });

    it('a failure of the first key is notSent and memory is unchanged', async () => {
      const { emitter, driver, d, l } = setup();
      driver.seedFan(d.id, known());
      emitter.failNext();
      await expect(driver.send(d, l, fan({ boost: true, sleep: true }))).rejects.toMatchObject({
        code: 'notSent',
      });
      expect(emitter.sent).toHaveLength(0);
      await driver.send(d, l, fan({ boost: true, sleep: true }));
      expect(names(emitter)).toEqual(['boost', 'sleep']);
    });

    it('does not record toggles that were never sent: they stay unknown', async () => {
      const { emitter, driver, d, l } = setup();
      await driver.send(d, l, fan({ boost: true }));
      expect(names(emitter)).toEqual(['speed3']);
      await driver.send(d, l, fan({ boost: false }));
      await driver.send(d, l, fan({ boost: true }));
      expect(names(emitter)).toEqual(['speed3']);
    });

    it('forgets the toggles after a power off and on cycle', async () => {
      const { emitter, driver, d, l } = setup();
      driver.seedFan(d.id, known({ boost: true }));
      await driver.send(d, l, fan({ power: false }));
      await driver.send(d, l, fan({ boost: false }));
      await driver.send(d, l, fan({ boost: true }));
      expect(names(emitter)).toEqual(['off', 'speed3']);
    });

    it('serialises sends: two concurrent presses do not double-send a toggle', async () => {
      const { emitter, driver, d, l } = setup();
      driver.seedFan(d.id, known());
      const [d2] = dev('fan', 'test/full', 'd2');
      driver.seedFan(d2.id, known());
      await Promise.all([
        driver.send(d, l, fan({ boost: true })),
        driver.send(d, l, fan({ boost: true })),
        driver.send(d2, l, fan({ boost: true })),
      ]);
      // d once, d again suppressed, d2 once (its own memory).
      expect(names(emitter)).toEqual(['boost', 'boost']);
    });

    it('sends emitter calls one at a time across devices', async () => {
      const emitter = createFakeEmitter();
      let active = 0;
      let max = 0;
      jest.spyOn(emitter, 'transmit').mockImplementation(async () => {
        active += 1;
        max = Math.max(max, active);
        await Promise.resolve();
        await Promise.resolve();
        active -= 1;
      });
      const driver = createIrDriver({ emitter, catalogue, gapMs: 0 });
      const [a, l] = dev('fan', 'test/full', 'a');
      const [b] = dev('fan', 'test/full', 'b');
      await Promise.all([driver.send(a, l, fan()), driver.send(b, l, fan())]);
      expect(max).toBe(1);
    });

    it('rejects unsupported before transmitting anything when a needed key is missing', async () => {
      const emitter = createFakeEmitter();
      const driver = createIrDriver({ emitter, gapMs: 0 });
      const [d, l] = dev('fan', 'atomberg-fan/1160');
      // 1160 has no speed3 (see ATTRIBUTION.md).
      await expect(driver.send(d, l, fan({ speed: 3 }))).rejects.toMatchObject({
        code: 'unsupported',
      });
      expect(emitter.sent).toHaveLength(0);
      // Known state: on at speed 4. Speed 5 plus a light toggle (no light key) must not half-send.
      driver.seedFan(d.id, known({ speed: 4 }));
      await expect(driver.send(d, l, fan({ speed: 5, light: true }))).rejects.toMatchObject({
        code: 'unsupported',
      });
      expect(emitter.sent).toHaveLength(0);
      // A timer change without a timer key is also unsupported.
      await expect(driver.send(d, l, fan({ speed: 4, timerHours: 4 }))).rejects.toMatchObject({
        code: 'unsupported',
      });
      expect(emitter.sent).toHaveLength(0);
    });

    it('still sends a supported change on the same remote', async () => {
      const emitter = createFakeEmitter();
      const driver = createIrDriver({ emitter, gapMs: 0 });
      const [d, l] = dev('fan', 'atomberg-fan/1160');
      driver.seedFan(d.id, known({ speed: 4 }));
      await driver.send(d, l, fan({ speed: 5, boost: true }));
      expect(emitter.sent).toHaveLength(2);
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
