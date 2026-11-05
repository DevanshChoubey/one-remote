import { MatterError } from '@/core/matterSetup';
import { createNativeMatterController } from '@/matter/native/controller';
import type { MatterStack } from '@/matter/native/stack';

function fakeStack(over: Partial<MatterStack> = {}): MatterStack {
  return {
    commission: jest.fn(async (_p, onStep) => {
      onStep('found');
      onStep('network');
      onStep('responds');
      return '42';
    }),
    info: jest.fn(async () => ({ hasOnOff: true, absMinCool: 1600, absMaxCool: 3000 })),
    read: jest.fn(async () => ({
      systemMode: 3,
      occupiedCoolingSetpoint: 2400,
      localTemperature: null,
    })),
    write: jest.fn(async () => undefined),
    subscribe: jest.fn(() => jest.fn()),
    removeFabric: jest.fn(async () => undefined),
    peerAddress: jest.fn(async () => '192.168.1.40'),
    ...over,
  };
}

const lock = () => ({ acquire: jest.fn(), release: jest.fn() });

describe('native matter controller', () => {
  it('builds the stack on first use only, and once', async () => {
    const stack = fakeStack();
    const load = jest.fn(async () => stack);
    const c = createNativeMatterController({ load, multicast: lock() });
    expect(load).not.toHaveBeenCalled();
    await c.read('42');
    await c.read('42');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('is available only where supported', () => {
    expect(
      createNativeMatterController({ supported: () => true, multicast: lock() }).available(),
    ).toBe(true);
    expect(
      createNativeMatterController({ supported: () => false, multicast: lock() }).available(),
    ).toBe(false);
  });

  it('commissions through the stack, reporting each step, and holds the multicast lock meanwhile', async () => {
    const m = lock();
    const c = createNativeMatterController({ load: async () => fakeStack(), multicast: m });
    const steps: string[] = [];
    await expect(c.commission('12345678901', (s) => steps.push(s))).resolves.toEqual({
      nodeId: '42',
    });
    expect(steps).toEqual(['found', 'network', 'responds']);
    expect(m.acquire).toHaveBeenCalledTimes(1);
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it('lets go of the multicast lock when a commission fails', async () => {
    const m = lock();
    const stack = fakeStack({
      commission: jest.fn().mockRejectedValue(new MatterError('notFound', 'found')),
    });
    const c = createNativeMatterController({ load: async () => stack, multicast: m });
    await expect(c.commission('x', () => undefined)).rejects.toMatchObject({ code: 'notFound' });
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it('keeps one lock for overlapping work and releases it after the last', async () => {
    const m = lock();
    const c = createNativeMatterController({ load: async () => fakeStack(), multicast: m });
    const unsub = c.subscribe('42', jest.fn(), jest.fn());
    await c.read('42');
    expect(m.acquire).toHaveBeenCalledTimes(1);
    expect(m.release).not.toHaveBeenCalled();
    unsub();
    unsub();
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it('subscribes through the stack and stops when asked', async () => {
    const stop = jest.fn();
    const stack = fakeStack({ subscribe: jest.fn(() => stop) });
    const c = createNativeMatterController({ load: async () => stack, multicast: lock() });
    const unsub = c.subscribe('42', jest.fn(), jest.fn());
    await new Promise((r) => setTimeout(r, 0));
    expect(stack.subscribe).toHaveBeenCalledWith('42', expect.any(Function), expect.any(Function));
    unsub();
    expect(stop).toHaveBeenCalled();
  });

  it('does not start a subscription that was cancelled before the stack loaded', async () => {
    const stack = fakeStack();
    const c = createNativeMatterController({ load: async () => stack, multicast: lock() });
    c.subscribe('42', jest.fn(), jest.fn())();
    await new Promise((r) => setTimeout(r, 0));
    expect(stack.subscribe).not.toHaveBeenCalled();
  });

  it('reports the link lost when the stack cannot load, and tries again next time', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(fakeStack());
    const c = createNativeMatterController({ load, multicast: lock() });
    const onLost = jest.fn();
    c.subscribe('42', jest.fn(), onLost);
    await new Promise((r) => setTimeout(r, 0));
    expect(onLost).toHaveBeenCalled();
    await expect(c.read('42')).resolves.toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('turns a failed load into unavailable', async () => {
    const c = createNativeMatterController({
      load: jest.fn().mockRejectedValue(new Error('x')),
      multicast: lock(),
    });
    await expect(c.read('42')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('passes writes, address and removal through, and gives the phone prefixes', async () => {
    const stack = fakeStack();
    const prefixes = jest.fn(async () => [{ address: '192.168.1.7', bits: 24 }]);
    const c = createNativeMatterController({
      load: async () => stack,
      multicast: lock(),
      prefixes,
    });
    await c.write('42', { onOff: true });
    expect(stack.write).toHaveBeenCalledWith('42', { onOff: true });
    await expect(c.peerAddress('42')).resolves.toBe('192.168.1.40');
    await c.removeFabric('42');
    expect(stack.removeFabric).toHaveBeenCalledWith('42');
    await expect(c.onLinkPrefixes()).resolves.toEqual([{ address: '192.168.1.7', bits: 24 }]);
  });
});
