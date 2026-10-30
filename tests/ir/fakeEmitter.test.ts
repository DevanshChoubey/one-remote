import { createFakeEmitter } from '@/ir/testing/fakeEmitter';

const sig = { freqHz: 38000, pattern: [560, 560] };

describe('fake emitter', () => {
  it('records sent signals', async () => {
    const e = createFakeEmitter();
    await e.transmit(sig);
    expect(e.sent).toEqual([sig]);
    expect(e.hasEmitter()).toBe(true);
  });

  it('failNext rejects once with notSent, then recovers', async () => {
    const e = createFakeEmitter();
    e.failNext();
    await expect(e.transmit(sig)).rejects.toMatchObject({ code: 'notSent' });
    await e.transmit(sig);
    expect(e.sent).toHaveLength(1);
  });

  it('has:false reports no emitter and rejects noIrEmitter', async () => {
    const e = createFakeEmitter({ has: false });
    expect(e.hasEmitter()).toBe(false);
    await expect(e.transmit(sig)).rejects.toMatchObject({ code: 'noIrEmitter' });
  });
});
