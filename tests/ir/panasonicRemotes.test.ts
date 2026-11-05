import { PANASONIC_REMOTES } from '@/ir/codes/panasonic';
import { panasonicCaps } from '@/ir/lgpl/panasonicAc';

describe('Panasonic remotes', () => {
  it('carry the capabilities of their own model', () => {
    for (const r of PANASONIC_REMOTES) {
      const model = r.id.split('/')[1];
      if (r.kind !== 'ac' || !model) throw new Error('not an AC remote');
      expect(r.caps).toEqual(panasonicCaps(model as Parameters<typeof panasonicCaps>[0]));
    }
  });

  it('offer ion only on DKE, and horizontal swing on DKE and RKR', () => {
    const caps = Object.fromEntries(
      PANASONIC_REMOTES.map((r) => [r.id, r.kind === 'ac' ? r.caps : undefined]),
    );
    expect(caps['panasonic-ac/dke']).toMatchObject({ ion: true, swingH: true });
    expect(caps['panasonic-ac/rkr']).toMatchObject({ swingH: true });
    expect(caps['panasonic-ac/rkr']?.ion).toBeUndefined();
    for (const id of ['panasonic-ac/jke', 'panasonic-ac/nke', 'panasonic-ac/lke']) {
      expect(caps[id]?.swingH).toBeUndefined();
      expect(caps[id]?.ion).toBeUndefined();
    }
  });
});
