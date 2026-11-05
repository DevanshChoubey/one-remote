import { defaultAcState } from '@/core';
import { panasonicAcSignal } from '@/ir/lgpl/panasonicAc';
import { createIrSetup } from '@/ir/setup';
import { createFakeEmitter } from '@/ir/testing/fakeEmitter';

describe('createIrSetup', () => {
  it('lists brands and candidates in catalogue order', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.brands('ac').map((b) => b.id)).toEqual(['panasonic']);
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

  it('transmits a fan key for fanSpeed3', async () => {
    const emitter = createFakeEmitter();
    await createIrSetup({ emitter }).sendTest('atomberg-fan/1170', 'fanSpeed3');
    expect(emitter.sent).toHaveLength(1);
  });

  it('lists the Atomberg candidates with 1170 first', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.candidates('atomberg').map((c) => c.remoteId)).toEqual([
      'atomberg-fan/1170',
      'atomberg-fan/1160',
    ]);
  });

  it('brandOf resolves remotes and returns undefined for unknown ids', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.brandOf('atomberg-fan/1160')?.name).toBe('Atomberg');
    expect(setup.brandOf('panasonic-ac/rkr')?.name).toBe('Panasonic');
    expect(setup.brandOf('nope')).toBeUndefined();
  });

  it('testPlan follows the catalogue; fans without a light fall back to speed 1', () => {
    const setup = createIrSetup({ emitter: createFakeEmitter() });
    expect(setup.testPlan('panasonic-ac/dke')).toEqual({ first: 'acOnCool24', confirm: 'acUp25' });
    expect(setup.testPlan('atomberg-fan/1160')).toEqual({
      first: 'fanSpeed3',
      confirm: 'fanSpeed1',
    });
  });

  it('rejects unknown remotes and presses the remote lacks as unsupported', async () => {
    const emitter = createFakeEmitter();
    const setup = createIrSetup({ emitter });
    await expect(setup.sendTest('nope', 'acUp25')).rejects.toMatchObject({ code: 'unsupported' });
    await expect(setup.sendTest('atomberg-fan/1160', 'fanSpeed3')).rejects.toMatchObject({
      code: 'unsupported',
    });
    await expect(setup.sendTest('atomberg-fan/1170', 'fanLight')).rejects.toMatchObject({
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
});
