import { defaultAcState, DeviceError } from '@/core';
import type { AcState, Command, Device, Link, Reported } from '@/core';
import { createMatterDriver } from '@/matter/driver';
import { createFakeController } from '@/matter/testing/fakeController';

const link: Extract<Link, { kind: 'matter' }> = { kind: 'matter', nodeId: '1' };
const device: Device = { id: 'ac1', kind: 'ac', name: 'AC', roomId: 'r', order: 0, links: [link] };
const cool24: AcState = {
  power: true,
  mode: 'cool',
  setpoint: 24,
  fan: 2,
  swing: false,
  sleep: false,
};
const set = (state: AcState): Command => ({ kind: 'ac.set', state });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('matter driver', () => {
  it('writes the full state in order', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    await driver.send(device, link, set(cool24));
    expect(controller.writes).toEqual([
      { onOff: true },
      { systemMode: 3 },
      { occupiedCoolingSetpoint: 2400 },
      { fanMode: 2 },
    ]);
  });

  it('reports real state', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    const seen: Reported[] = [];
    const off = driver.observe?.(device, link, (r) => seen.push(r));
    await jest.advanceTimersByTimeAsync(0);
    controller.setAttrs({ occupiedCoolingSetpoint: 2500, localTemperature: 2700 });
    const last = seen[seen.length - 1];
    expect(last).toMatchObject({ kind: 'ac', roomTemp: 27 });
    expect(last?.kind === 'ac' && last.state.setpoint).toBe(25);
    off?.();
  });

  it('emits the first read before any change', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    const seen: Reported[] = [];
    driver.observe?.(device, link, (r) => seen.push(r));
    await jest.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(1);
  });

  it('rejects a non-local peer', async () => {
    const prefixes = [{ address: '2401:4900:1c3a:5e10::7', bits: 64 }];
    const bad = createFakeController({ peer: '2001:db8::5', prefixes });
    const driver = createMatterDriver({ controller: bad, enabled: true });
    await expect(driver.send(device, link, set(cool24))).rejects.toMatchObject({
      code: 'notLocal',
    });
    // Stays refused until restart, and nothing was written.
    await expect(driver.send(device, link, set(cool24))).rejects.toMatchObject({
      code: 'notLocal',
    });
    expect(bad.writes).toEqual([]);

    const good = createFakeController({ peer: '2401:4900:1c3a:5e10::abcd', prefixes });
    await expect(
      createMatterDriver({ controller: good, enabled: true }).send(device, link, set(cool24)),
    ).resolves.toBeUndefined();
  });

  it('refuses a node whose address is unknown', async () => {
    const controller = createFakeController();
    controller.peerAddress = async () => null;
    const driver = createMatterDriver({ controller, enabled: true });
    await expect(driver.send(device, link, set(cool24))).rejects.toMatchObject({
      code: 'notLocal',
    });
  });

  it('does not observe a non-local node', async () => {
    const controller = createFakeController({ peer: '8.8.8.8' });
    const driver = createMatterDriver({ controller, enabled: true });
    const spy = jest.spyOn(controller, 'subscribe');
    const cb = jest.fn();
    driver.observe?.(device, link, cb);
    await jest.advanceTimersByTimeAsync(0);
    expect(spy).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
  });

  it('unreachable is notSent', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    controller.unreachable(true);
    await expect(driver.send(device, link, set(cool24))).rejects.toMatchObject({ code: 'notSent' });
    expect(controller.writes).toEqual([]);
  });

  it('unreachable after the first write is timeout', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    const real = controller.write;
    let n = 0;
    controller.write = async (id, w) => {
      if (n++ === 1) controller.unreachable(true);
      return real(id, w);
    };
    await expect(driver.send(device, link, set(cool24))).rejects.toMatchObject({ code: 'timeout' });
  });

  it('resubscribes after loss with backoff', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    const spy = jest.spyOn(controller, 'subscribe');
    const seen: Reported[] = [];
    driver.observe?.(device, link, (r) => seen.push(r));
    await jest.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(1);
    controller.lose();
    await jest.advanceTimersByTimeAsync(999);
    expect(spy).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(spy).toHaveBeenCalledTimes(2);
    const before = seen.length;
    controller.setAttrs({ occupiedCoolingSetpoint: 2200 });
    expect(seen.length).toBe(before + 1);
  });

  it('backs off further while the AC stays away, then recovers', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({
      controller,
      enabled: true,
      resubscribeMs: [100, 200],
    });
    const spy = jest.spyOn(controller, 'subscribe');
    driver.observe?.(device, link, () => undefined);
    await jest.advanceTimersByTimeAsync(0);
    controller.lose();
    controller.unreachable(true);
    await jest.advanceTimersByTimeAsync(100); // first retry fails
    await jest.advanceTimersByTimeAsync(199);
    const afterFirst = spy.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1); // second retry at 200 ms, fails
    controller.unreachable(false);
    await jest.advanceTimersByTimeAsync(200); // capped at the last delay, succeeds
    expect(spy.mock.calls.length).toBeGreaterThan(afterFirst);
    const seen: number[] = [];
    // after recovery the observer is live again
    driver.observe?.(device, link, (r) => r.kind === 'ac' && seen.push(r.state.setpoint));
    await jest.advanceTimersByTimeAsync(0);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('sends while lost try a read first and throw notSent if it fails', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    driver.observe?.(device, link, () => undefined);
    await jest.advanceTimersByTimeAsync(0);
    controller.lose();
    controller.unreachable(true);
    await expect(driver.send(device, link, set(cool24))).rejects.toMatchObject({ code: 'notSent' });
    controller.unreachable(false);
    await expect(driver.send(device, link, set(cool24))).resolves.toBeUndefined();
  });

  it('stops resubscribing after unsubscribe', async () => {
    const controller = createFakeController();
    const driver = createMatterDriver({ controller, enabled: true });
    const spy = jest.spyOn(controller, 'subscribe');
    const off = driver.observe?.(device, link, () => undefined);
    await jest.advanceTimersByTimeAsync(0);
    controller.lose();
    off?.();
    await jest.advanceTimersByTimeAsync(60000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("clamps to the AC's limits", async () => {
    const controller = createFakeController({ info: { absMinCool: 1800 } });
    const driver = createMatterDriver({ controller, enabled: true });
    await driver.send(device, link, set({ ...cool24, setpoint: 16 }));
    expect(controller.writes).toContainEqual({ occupiedCoolingSetpoint: 1800 });
  });

  it('rejected mode is unsupported and dropped from capabilities', async () => {
    const controller = createFakeController({ rejectModes: [8] });
    const driver = createMatterDriver({ controller, enabled: true });
    await expect(driver.send(device, link, set({ ...cool24, mode: 'dry' }))).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(driver.capabilities(device, link).acModes).not.toContain('dry');
    expect(driver.capabilities(device, link).acModes).toContain('cool');
  });

  it('a rejected non-mode write is unsupported too', async () => {
    const controller = createFakeController();
    controller.write = async () => {
      const { MatterError } = await import('@/core/matterSetup');
      throw new MatterError('rejected');
    };
    const driver = createMatterDriver({ controller, enabled: true });
    await expect(driver.send(device, link, set(cool24))).rejects.toBeInstanceOf(DeviceError);
  });

  it('is disabled when not enabled or the controller is unavailable', () => {
    expect(
      createMatterDriver({ controller: createFakeController(), enabled: false }).available(),
    ).toBe(false);
    expect(
      createMatterDriver({
        controller: createFakeController({ available: false }),
        enabled: true,
      }).available(),
    ).toBe(false);
    expect(
      createMatterDriver({ controller: createFakeController(), enabled: true }).available(),
    ).toBe(true);
  });

  it('supports only ac.set on an ac, and exposes default then cached capabilities', async () => {
    const controller = createFakeController({ info: { absMinCool: 1800, fanModeSequence: 1 } });
    const driver = createMatterDriver({ controller, enabled: true });
    expect(driver.kind).toBe('matter');
    expect(driver.supports(device, link, set(defaultAcState()))).toBe(true);
    expect(driver.supports(device, link, { kind: 'tv.powerOn' })).toBe(false);
    expect(driver.supports({ ...device, kind: 'tv' }, link, set(defaultAcState()))).toBe(false);
    expect(driver.capabilities(device, link)).toEqual({
      acModes: ['cool', 'dry', 'fan', 'auto'],
      acFan: ['auto', 1, 2, 3],
      setpoint: { min: 16, max: 30 },
      swing: false,
      sleep: false,
    });
    await driver.send(device, link, set(cool24));
    expect(driver.capabilities(device, link)).toMatchObject({
      setpoint: { min: 18, max: 30 },
      acFan: [1, 3],
    });
  });

  it('rejects commands it does not support', async () => {
    const driver = createMatterDriver({ controller: createFakeController(), enabled: true });
    await expect(driver.send(device, link, { kind: 'tv.powerOn' })).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(
      driver.send(device, { kind: 'ir', remoteId: 'x' }, set(cool24)),
    ).rejects.toMatchObject({ code: 'noLink' });
  });
});
