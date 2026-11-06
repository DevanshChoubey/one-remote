import { defaultAcState } from '@/core';
import { createCatalogue } from '@/ir/catalogue';
import type { IrSignal } from '@/ir/emitter';
import { panasonicAcSignal } from '@/ir/lgpl/panasonicAc';
import { createIrSetup } from '@/ir/setup';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';

describe('createIrSetup', () => {
  it('lists brands and candidates in catalogue order', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.brands('ac').map((b) => b.id)).toContain('panasonic');
    expect(setup.candidates('panasonic')).toHaveLength(5);
    expect(setup.candidates('panasonic')[0]).toEqual({
      remoteId: 'panasonic-ac/dke',
      label: expect.any(String),
    });
  });

  it('sendTest acUp25 transmits the encoded 25 degree state', async () => {
    const emitter = createFakeEmitter();
    await createIrSetup({ emitter }).sendTest('panasonic-ac/dke', 'acUp25');
    expect(emitter.sent).toEqual([
      panasonicAcSignal({ ...defaultAcState(), power: true, setpoint: 25 }, 'dke'),
    ]);
  });

  it('sendTest acOnCool24 transmits power on, cool, 24', async () => {
    const emitter = createFakeEmitter();
    await createIrSetup({ emitter }).sendTest('panasonic-ac/jke', 'acOnCool24');
    expect(emitter.sent).toEqual([panasonicAcSignal({ ...defaultAcState(), power: true }, 'jke')]);
  });

  it('sends every frame of a multi-frame AC press, with prev = off, then = the first press', async () => {
    const encode = jest.fn((): IrSignal[] => [
      { freqHz: 38000, pattern: [1, 1] },
      { freqHz: 38000, pattern: [2, 1] },
    ]);
    const catalogue = createCatalogue(
      [{ id: 't/1', kind: 'ac', brandId: 't', label: 'T', caps: {}, encode }],
      [],
    );
    const emitter = createFakeEmitter();
    const setup = createIrSetup({ emitter, catalogue, gapMs: 0 });
    await setup.sendTest('t/1', 'acOnCool24');
    expect(encode).toHaveBeenLastCalledWith({ ...defaultAcState(), power: true }, defaultAcState());
    await setup.sendTest('t/1', 'acUp25');
    expect(encode).toHaveBeenLastCalledWith(
      { ...defaultAcState(), power: true, setpoint: 25 },
      { ...defaultAcState(), power: true },
    );
    expect(emitter.sent.map((s) => s.pattern[0])).toEqual([1, 2, 1, 2]);
  });

  it('passes seedAc to the driver', () => {
    const seedAc = jest.fn();
    createIrSetup({ emitter: createFakeEmitter(), seedAc }).seedAc('d', defaultAcState());
    expect(seedAc).toHaveBeenCalledWith('d', defaultAcState());
  });

  it('transmits a fan key for fanSpeed3', async () => {
    const emitter = createFakeEmitter();
    await createIrSetup({ emitter }).sendTest('atomberg-fan/nec', 'fanSpeed3');
    expect(emitter.sent).toHaveLength(1);
  });

  it('lists the one Atomberg candidate', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.candidates('atomberg').map((c) => c.remoteId)).toEqual(['atomberg-fan/nec']);
  });

  it('brandOf resolves remotes and returns undefined for unknown ids', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.brandOf('atomberg-fan/nec')?.name).toBe('Atomberg');
    expect(setup.brandOf('panasonic-ac/rkr')?.name).toBe('Panasonic');
    expect(setup.brandOf('nope')).toBeUndefined();
  });

  it('testPlan follows the catalogue; a fan with a light confirms with the light', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.testPlan('panasonic-ac/dke')).toEqual({ first: 'acOnCool24', confirm: 'acUp25' });
    expect(setup.testPlan('atomberg-fan/nec')).toEqual({
      first: 'fanSpeed3',
      confirm: 'fanLight',
    });
  });

  it('rejects unknown remotes and presses the remote lacks as unsupported', async () => {
    const emitter = createFakeEmitter();
    const setup = createIrSetup({ emitter });
    await expect(setup.sendTest('nope', 'acUp25')).rejects.toMatchObject({ code: 'unsupported' });
    await expect(setup.sendTest('panasonic-ac/dke', 'fanLight')).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(setup.sendTest('panasonic-ac/dke', 'fanSpeed3')).rejects.toMatchObject({
      code: 'unsupported',
    });
    expect(emitter.sent).toHaveLength(0);
  });

  it('a failing emitter surfaces notSent; no emitter is reported', async () => {
    const emitter = createFakeEmitter();
    emitter.failNext();
    const setup = createIrSetup({ emitter });
    await expect(setup.sendTest('panasonic-ac/dke', 'acUp25')).rejects.toMatchObject({
      code: 'notSent',
    });
    expect(createIrSetup({ emitter: createFakeEmitter({ has: false }) }).hasEmitter()).toBe(false);
  });

  it('gives the state both confirmed test presses leave', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    const on = { power: true, boost: false, sleep: false, timerHours: 0 };
    expect(setup.testOutcome('panasonic-ac/dke')).toEqual({
      kind: 'ac',
      state: { ...defaultAcState(), power: true, setpoint: 25 },
    });
    // Speed 3, then the light toggle from off (the assumption the driver's toggles use).
    expect(setup.testOutcome('atomberg-fan/nec')).toEqual({
      kind: 'fan',
      state: { ...on, speed: 3, light: true },
    });
    const noLight = createCatalogue(
      [{ id: 'f/1', kind: 'fan', brandId: 'f', label: 'F', caps: {}, keys: {} }],
      [],
    );
    expect(
      createIrSetup({ emitter: createFakeEmitter(), catalogue: noLight }).testOutcome('f/1'),
    ).toEqual({ kind: 'fan', state: { ...on, speed: 1 } });
  });
});
