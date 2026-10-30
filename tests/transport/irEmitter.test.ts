import { createNativeIrEmitter } from '@/transport/irEmitter';

const mockModule: { current: unknown } = { current: null };

jest.mock('../../modules/ir-emitter', () => ({
  get IrEmitterModule() {
    return mockModule.current;
  },
}));

const sig = { freqHz: 38000, pattern: [560, 560, 560, 1690] };

describe('native IR emitter adapter', () => {
  it('without the native module: no emitter, transmit rejects noIrEmitter', async () => {
    mockModule.current = null;
    const e = createNativeIrEmitter();
    expect(e.hasEmitter()).toBe(false);
    await expect(e.transmit(sig)).rejects.toMatchObject({ code: 'noIrEmitter' });
  });

  it('passes freq and pattern to native', async () => {
    const transmit = jest.fn().mockResolvedValue(undefined);
    mockModule.current = { hasIrEmitter: () => true, transmit };
    const e = createNativeIrEmitter();
    expect(e.hasEmitter()).toBe(true);
    await e.transmit(sig);
    expect(transmit).toHaveBeenCalledWith(38000, sig.pattern);
  });

  it('maps E_IR_TRANSMIT to notSent', async () => {
    const transmit = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('x'), { code: 'E_IR_TRANSMIT' }));
    mockModule.current = { hasIrEmitter: () => true, transmit };
    await expect(createNativeIrEmitter().transmit(sig)).rejects.toMatchObject({ code: 'notSent' });
  });

  it('rejects odd length and over-long patterns as unsupported without calling native', async () => {
    const transmit = jest.fn();
    mockModule.current = { hasIrEmitter: () => true, transmit };
    const e = createNativeIrEmitter();
    await expect(e.transmit({ freqHz: 38000, pattern: [1, 2, 3] })).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(
      e.transmit({ freqHz: 38000, pattern: [1_000_001, 1_000_000] }),
    ).rejects.toMatchObject({ code: 'unsupported' });
    expect(transmit).not.toHaveBeenCalled();
  });

  it('allows exactly 2,000,000 us', async () => {
    const transmit = jest.fn().mockResolvedValue(undefined);
    mockModule.current = { hasIrEmitter: () => true, transmit };
    await createNativeIrEmitter().transmit({ freqHz: 38000, pattern: [1_000_000, 1_000_000] });
    expect(transmit).toHaveBeenCalled();
  });
});
