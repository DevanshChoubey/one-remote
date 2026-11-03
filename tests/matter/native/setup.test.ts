import { MatterError } from '@/core/matterSetup';
import { createMatterSetup } from '@/matter/native/setup';
import { createFakeController } from '@/matter/testing/fakeController';

const GOOD = '34970112332';

describe('matter setup', () => {
  it('parses codes and says whether Matter is available', () => {
    const setup = createMatterSetup(createFakeController({ available: true }));
    expect(setup.available()).toBe(true);
    expect(setup.parseCode(GOOD)).toEqual({ kind: 'manual', digits: GOOD });
    expect(setup.parseCode('1234')).toBeNull();
    expect(createMatterSetup(createFakeController({ available: false })).available()).toBe(false);
  });

  it('commissions a manual code and returns the matter link', async () => {
    const controller = createFakeController({ available: true });
    const spy = jest.spyOn(controller, 'commission');
    const setup = createMatterSetup(controller);
    const steps: string[] = [];
    const code = setup.parseCode(GOOD);
    if (!code) throw new Error('code should parse');
    const link = await setup.commission(code, (s) => steps.push(s));
    expect(link).toMatchObject({ kind: 'matter' });
    expect(link.nodeId).toBeTruthy();
    expect(spy).toHaveBeenCalledWith(GOOD, expect.any(Function));
    expect(steps).toEqual(['found', 'network', 'responds']);
  });

  it('sends a QR payload as is', async () => {
    const controller = createFakeController({ available: true });
    const spy = jest.spyOn(controller, 'commission');
    await createMatterSetup(controller).commission(
      { kind: 'qr', payload: 'MT:Y.K9042C00KA0648G00' },
      () => undefined,
    );
    expect(spy).toHaveBeenCalledWith('MT:Y.K9042C00KA0648G00', expect.any(Function));
  });

  it('refuses when Matter is not available, and passes commissioning errors on', async () => {
    await expect(
      createMatterSetup(createFakeController({ available: false })).commission(
        { kind: 'manual', digits: GOOD },
        () => undefined,
      ),
    ).rejects.toMatchObject({ code: 'unavailable' });
    await expect(
      createMatterSetup(createFakeController({ available: true, failAt: 'network' })).commission(
        { kind: 'manual', digits: GOOD },
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(MatterError);
  });
});
