import { defaultAcState } from '@/core';
import type { BrandInfo } from '@/core';
import { createCatalogue, testPlan, type Remote } from '@/ir/catalogue';

const sig = { freqHz: 38000, pattern: [1, 1] };
const ac = (id: string, brandId = 'panasonic'): Remote => ({
  id,
  kind: 'ac',
  brandId,
  label: id,
  caps: {},
  encode: () => sig,
});
const fan = (id: string, light: boolean): Remote => ({
  id,
  kind: 'fan',
  brandId: 'atomberg',
  label: id,
  caps: { fanLight: light },
  keys: {},
});
const brands: BrandInfo[] = [
  { id: 'panasonic', name: 'Panasonic', kind: 'ac', matter: true },
  { id: 'empty', name: 'Empty', kind: 'ac', matter: false },
  { id: 'atomberg', name: 'Atomberg', kind: 'fan', matter: false },
];

describe('createCatalogue', () => {
  const cat = createCatalogue([ac('p/b'), ac('p/a'), fan('f/1', true), fan('f/2', false)], brands);

  it('lists only brands that have remotes', () => {
    expect(cat.brands('ac').map((b) => b.id)).toEqual(['panasonic']);
    expect(cat.brands('fan').map((b) => b.id)).toEqual(['atomberg']);
  });

  it('keeps insertion order', () => {
    expect(cat.remotes('panasonic').map((r) => r.id)).toEqual(['p/b', 'p/a']);
  });

  it('returns undefined for unknown ids', () => {
    expect(cat.remote('nope')).toBeUndefined();
    expect(cat.remote('p/a')?.id).toBe('p/a');
    expect(cat.remotes('nope')).toEqual([]);
  });

  it('builds the test plan', () => {
    expect(testPlan(ac('x'))).toEqual({ first: 'acOnCool24', confirm: 'acUp25' });
    expect(testPlan(fan('f', true))).toEqual({ first: 'fanSpeed3', confirm: 'fanLight' });
    expect(testPlan(fan('f', false))).toEqual({ first: 'fanSpeed3', confirm: 'fanSpeed1' });
    expect(defaultAcState().power).toBe(false);
  });
});
