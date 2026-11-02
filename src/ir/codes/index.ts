import type { BrandInfo } from '@/core';
import { ATOMBERG_REMOTES } from './atomberg';
import { createCatalogue, type Catalogue } from '../catalogue';
import { LG_TV_REMOTE } from './lgTv';
import { PANASONIC_REMOTES } from './panasonic';

// v1 brands (spec section 6). A brand is listed only once its codes have tests.
// The LG TV remote is not a listed brand: the TV lane uses 'lg-tv/nec' directly.
const BRANDS: BrandInfo[] = [
  { id: 'panasonic', name: 'Panasonic', kind: 'ac', matter: true },
  { id: 'atomberg', name: 'Atomberg', kind: 'fan', matter: false },
];

export const defaultCatalogue: Catalogue = createCatalogue(
  [...PANASONIC_REMOTES, ...ATOMBERG_REMOTES, LG_TV_REMOTE],
  BRANDS,
);
