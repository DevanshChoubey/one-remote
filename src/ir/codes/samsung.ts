import type { Remote } from '../catalogue';
import { SAMSUNG_CAPS, samsungAcSignal } from '../lgpl/samsungAc';

/** SAMSUNG_AC: the AR-series split remotes (DB93 / DB96 families). One protocol for the brand. */
export const SAMSUNG_REMOTES: Remote[] = [
  {
    id: 'samsung-ac/ar',
    kind: 'ac',
    brandId: 'samsung',
    label: 'Samsung AC remote (AR series)',
    caps: SAMSUNG_CAPS,
    encode: (next, prev) => samsungAcSignal(next, prev),
  },
];
