import type { BrandInfo } from '@/core';
import { ATOMBERG_REMOTES } from './atomberg';
import { CARRIER_REMOTES } from './carrier';
import { createCatalogue, type Catalogue } from '../catalogue';
import { DAIKIN_REMOTES } from './daikin';
import { GREE_REMOTES } from './gree';
import { BLUE_STAR_REMOTES, GODREJ_REMOTES, LLOYD_REMOTES, VOLTAS_REMOTES } from './guessBrands';
import { HAIER_REMOTES } from './haier';
import { HITACHI_REMOTES } from './hitachi';
import { LG_REMOTES } from './lg';
import { LG_TV_REMOTE } from './lgTv';
import { MIDEA_REMOTES } from './midea';
import { MITSUBISHI_HEAVY_REMOTES } from './mitsubishiHeavy';
import { PANASONIC_REMOTES } from './panasonic';
import { SAMSUNG_REMOTES } from './samsung';
import { WHIRLPOOL_REMOTES } from './whirlpool';

// A brand is listed only once its codes have tests. AC brands are in alphabetical order, the order
// the brand picker shows. The LG TV remote is not a listed brand: the TV lane uses 'lg-tv/nec'
// directly.
const BRANDS: BrandInfo[] = [
  { id: 'blue-star', name: 'Blue Star', kind: 'ac', matter: false },
  { id: 'carrier', name: 'Carrier', kind: 'ac', matter: false },
  { id: 'daikin', name: 'Daikin', kind: 'ac', matter: false },
  { id: 'godrej', name: 'Godrej', kind: 'ac', matter: false },
  { id: 'gree', name: 'Gree', kind: 'ac', matter: false },
  { id: 'haier', name: 'Haier', kind: 'ac', matter: false },
  { id: 'hitachi', name: 'Hitachi', kind: 'ac', matter: false },
  { id: 'lg', name: 'LG', kind: 'ac', matter: false },
  { id: 'lloyd', name: 'Lloyd', kind: 'ac', matter: false },
  { id: 'midea', name: 'Midea', kind: 'ac', matter: false },
  { id: 'mitsubishi-heavy', name: 'Mitsubishi Heavy', kind: 'ac', matter: false },
  { id: 'panasonic', name: 'Panasonic', kind: 'ac', matter: true },
  { id: 'samsung', name: 'Samsung', kind: 'ac', matter: false },
  { id: 'voltas', name: 'Voltas', kind: 'ac', matter: false },
  { id: 'whirlpool', name: 'Whirlpool', kind: 'ac', matter: false },
  { id: 'atomberg', name: 'Atomberg', kind: 'fan', matter: false },
];

export const defaultCatalogue: Catalogue = createCatalogue(
  [
    ...BLUE_STAR_REMOTES,
    ...CARRIER_REMOTES,
    ...DAIKIN_REMOTES,
    ...GODREJ_REMOTES,
    ...GREE_REMOTES,
    ...HAIER_REMOTES,
    ...HITACHI_REMOTES,
    ...LG_REMOTES,
    ...LLOYD_REMOTES,
    ...MIDEA_REMOTES,
    ...MITSUBISHI_HEAVY_REMOTES,
    ...PANASONIC_REMOTES,
    ...SAMSUNG_REMOTES,
    ...VOLTAS_REMOTES,
    ...WHIRLPOOL_REMOTES,
    ...ATOMBERG_REMOTES,
    LG_TV_REMOTE,
  ],
  BRANDS,
);
