import type { BrandInfo } from '@/core';
import { ATOMBERG_REMOTES } from './atomberg';
import { createCatalogue, type Catalogue } from '../catalogue';
import { DAIKIN_REMOTES } from './daikin';
import { HITACHI_REMOTES } from './hitachi';
import { LG_REMOTES } from './lg';
import { LG_TV_REMOTE } from './lgTv';
import { PANASONIC_REMOTES } from './panasonic';
import { SAMSUNG_REMOTES } from './samsung';

// A brand is listed only once its codes have tests. AC brands are in alphabetical order, the order
// the brand picker shows. The LG TV remote is not a listed brand: the TV lane uses 'lg-tv/nec'
// directly.
const BRANDS: BrandInfo[] = [
  { id: 'daikin', name: 'Daikin', kind: 'ac', matter: false },
  { id: 'hitachi', name: 'Hitachi', kind: 'ac', matter: false },
  { id: 'lg', name: 'LG', kind: 'ac', matter: false },
  { id: 'panasonic', name: 'Panasonic', kind: 'ac', matter: true },
  { id: 'samsung', name: 'Samsung', kind: 'ac', matter: false },
  { id: 'atomberg', name: 'Atomberg', kind: 'fan', matter: false },
];

export const defaultCatalogue: Catalogue = createCatalogue(
  [
    ...DAIKIN_REMOTES,
    ...HITACHI_REMOTES,
    ...LG_REMOTES,
    ...PANASONIC_REMOTES,
    ...SAMSUNG_REMOTES,
    ...ATOMBERG_REMOTES,
    LG_TV_REMOTE,
  ],
  BRANDS,
);
