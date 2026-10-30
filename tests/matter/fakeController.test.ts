import { MatterError } from '@/core/matterSetup';
import type { CommissionStep } from '@/core/matterSetup';
import { createFakeController } from '@/matter/testing/fakeController';

describe('fake controller', () => {
  it('commissions through every step', async () => {
    const c = createFakeController();
    const steps: CommissionStep[] = [];
    const r = await c.commission('MT:X', (s) => steps.push(s));
    expect(steps).toEqual(['found', 'network', 'responds']);
    expect(r.nodeId).toBeTruthy();
  });

  it('fails at the chosen step', async () => {
    const c = createFakeController({ failAt: 'network' });
    const steps: CommissionStep[] = [];
    await expect(c.commission('MT:X', (s) => steps.push(s))).rejects.toMatchObject({
      code: 'networkFailed',
      step: 'network',
    });
    expect(steps).toEqual(['found']);
  });

  it('fails at found and responds with the matching codes', async () => {
    await expect(
      createFakeController({ failAt: 'found' }).commission('x', () => undefined),
    ).rejects.toMatchObject({
      code: 'notFound',
    });
    await expect(
      createFakeController({ failAt: 'responds' }).commission('x', () => undefined),
    ).rejects.toMatchObject({ code: 'noResponse' });
  });

  it('delivers setAttrs to subscribers until unsubscribed', async () => {
    const c = createFakeController();
    const seen: number[] = [];
    const off = c.subscribe(
      '1',
      (a) => seen.push(a.occupiedCoolingSetpoint),
      () => undefined,
    );
    c.setAttrs({ occupiedCoolingSetpoint: 2500 });
    off();
    c.setAttrs({ occupiedCoolingSetpoint: 2600 });
    expect(seen).toEqual([2500]);
    expect((await c.read('1')).occupiedCoolingSetpoint).toBe(2600);
  });

  it('records writes and applies them to attributes', async () => {
    const c = createFakeController();
    await c.write('1', { occupiedCoolingSetpoint: 2200 });
    expect(c.writes).toEqual([{ occupiedCoolingSetpoint: 2200 }]);
    expect((await c.read('1')).occupiedCoolingSetpoint).toBe(2200);
  });

  it('lose() calls onLost; unreachable rejects reads and writes', async () => {
    const c = createFakeController();
    const lost = jest.fn();
    c.subscribe('1', () => undefined, lost);
    c.lose();
    expect(lost).toHaveBeenCalledTimes(1);
    c.unreachable(true);
    await expect(c.write('1', { onOff: true })).rejects.toBeInstanceOf(MatterError);
    await expect(c.write('1', { onOff: true })).rejects.toMatchObject({ code: 'unreachable' });
    await expect(c.read('1')).rejects.toMatchObject({ code: 'unreachable' });
    expect(c.writes).toEqual([]);
    c.unreachable(false);
    await expect(c.read('1')).resolves.toBeDefined();
  });

  it('exposes info, peer, prefixes and availability', async () => {
    const c = createFakeController({
      available: false,
      info: { absMinCool: 1800 },
      peer: '10.0.0.5',
      prefixes: [{ address: '10.0.0.1', bits: 24 }],
    });
    expect(c.available()).toBe(false);
    expect((await c.info('1')).absMinCool).toBe(1800);
    expect(await c.peerAddress('1')).toBe('10.0.0.5');
    expect(await c.onLinkPrefixes()).toEqual([{ address: '10.0.0.1', bits: 24 }]);
    expect(createFakeController().available()).toBe(true);
  });
});
