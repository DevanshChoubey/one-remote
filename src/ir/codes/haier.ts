import type { Remote } from '../catalogue';
import { HAIER176_CAPS, HAIER_CAPS, haier176AcSignal, haierAcSignal } from '../lgpl/haierAc';

// Most likely first: the YR-W02 remote (HAIER_AC_YRW02), then the 22-byte V9014557 remote
// (HAIER_AC176, the same protocol with a second section), then the older HSU07-HEA03 remote
// (HAIER_AC).
export const HAIER_REMOTES: Remote[] = [
  {
    id: 'haier-ac/yrw02',
    kind: 'ac',
    brandId: 'haier',
    label: 'Haier AC remote YR-W02',
    caps: HAIER176_CAPS,
    encode: (next) => haier176AcSignal(next, 'yrw02'),
  },
  {
    id: 'haier-ac/v9014557',
    kind: 'ac',
    brandId: 'haier',
    label: 'Haier AC remote V9014557 M47 8D',
    caps: HAIER176_CAPS,
    encode: (next) => haier176AcSignal(next, 'v9014557a'),
  },
  {
    id: 'haier-ac/hsu07',
    kind: 'ac',
    brandId: 'haier',
    label: 'Haier AC remote HSU07-HEA03 (older units)',
    caps: HAIER_CAPS,
    encode: (next) => haierAcSignal(next),
  },
];
