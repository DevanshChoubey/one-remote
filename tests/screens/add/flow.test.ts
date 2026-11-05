import type { BrandInfo, Link } from '@/core';
import {
  afterBrand,
  afterMatter,
  canOfferIrBackup,
  offersMiraie,
} from '@/screens/add/appliance/flow';
import type { FlowEnv } from '@/screens/add/appliance/flow';

const panasonic: BrandInfo = { id: 'panasonic', name: 'Panasonic', kind: 'ac', matter: true };
const atomberg: BrandInfo = { id: 'atomberg', name: 'Atomberg', kind: 'fan', matter: false };
const matterLink: Link = { kind: 'matter', nodeId: 'n1' };

const env = (over: Partial<FlowEnv> = {}): FlowEnv => ({
  kind: 'ac',
  irAvailable: true,
  matterAvailable: false,
  hasIrCodes: () => true,
  brandName: (id) => (id === 'panasonic' ? 'Panasonic' : 'Atomberg'),
  ...over,
});

describe('afterBrand', () => {
  it('goes to Matter for a Matter brand when Matter can pair, even on an IR phone', () => {
    expect(afterBrand(panasonic, env({ matterAvailable: true }))).toEqual({
      name: 'matter',
      brandId: 'panasonic',
    });
  });

  it('goes to the IR test when there is no Matter step', () => {
    expect(afterBrand(panasonic, env())).toEqual({
      name: 'irTest',
      brandId: 'panasonic',
      backup: false,
    });
  });

  it('says the phone has no IR for a brand that needs it', () => {
    expect(afterBrand(atomberg, env({ kind: 'fan', irAvailable: false }))).toEqual({
      name: 'noIr',
      brandId: 'atomberg',
    });
  });

  it('says there are no codes when the catalogue has none', () => {
    expect(afterBrand(panasonic, env({ hasIrCodes: () => false }))).toEqual({
      name: 'noCodes',
      brandId: 'panasonic',
      backup: false,
    });
  });
});

describe('afterMatter', () => {
  it('offers an IR backup on an IR phone', () => {
    expect(afterMatter('panasonic', matterLink, env({ matterAvailable: true }))).toEqual({
      name: 'irTest',
      brandId: 'panasonic',
      backup: true,
    });
  });

  it('goes straight to naming on a phone without IR', () => {
    expect(afterMatter('panasonic', matterLink, env({ irAvailable: false }))).toEqual({
      name: 'name',
      links: [matterLink],
      suggestedName: 'Panasonic AC',
    });
  });

  it('goes to naming when there are no IR codes', () => {
    expect(afterMatter('panasonic', matterLink, env({ hasIrCodes: () => false })).name).toBe(
      'name',
    );
  });
});

// miraie lane
describe('afterBrand with the MirAIe opt-in', () => {
  it('asks how a Panasonic AC connects only when MirAIe is on', () => {
    expect(afterBrand(panasonic, env({ miraieOn: true }))).toEqual({
      name: 'connectVia',
      brandId: 'panasonic',
    });
    expect(afterBrand(panasonic, env({ miraieOn: false, matterAvailable: true })).name).toBe(
      'matter',
    );
  });

  it('never offers MirAIe for fans or other brands', () => {
    expect(offersMiraie('panasonic', env({ kind: 'fan', miraieOn: true }))).toBe(false);
    expect(afterBrand(atomberg, env({ kind: 'fan', miraieOn: true })).name).toBe('irTest');
  });

  it('offers an IR backup after MirAIe only where IR can send', () => {
    const cloud: Link = { kind: 'miraie', deviceId: 'd1', homeId: 'h1', topic: 'u/h1/d1' };
    expect(afterMatter('panasonic', cloud, env())).toEqual({
      name: 'irTest',
      brandId: 'panasonic',
      backup: true,
    });
    expect(canOfferIrBackup('panasonic', env({ irAvailable: false }))).toBe(false);
    expect(afterMatter('panasonic', cloud, env({ irAvailable: false }))).toEqual({
      name: 'name',
      links: [cloud],
      suggestedName: expect.any(String),
    });
  });
});
