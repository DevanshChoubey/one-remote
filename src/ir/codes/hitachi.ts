import type { Remote } from '../catalogue';
import {
  HITACHI424_CAPS,
  HITACHI_CAPS,
  hitachi424AcSignal,
  hitachiAcSignal,
} from '../lgpl/hitachiAc';

// Most likely first: the newer RAR-8P2 remote (HITACHI_AC424, RAS-AJ series), then the older
// RAS-35THA6 remote (HITACHI_AC).
export const HITACHI_REMOTES: Remote[] = [
  {
    id: 'hitachi-ac/rar-8p2',
    kind: 'ac',
    brandId: 'hitachi',
    label: 'Hitachi AC remote RAR-8P2 (newer)',
    caps: HITACHI424_CAPS,
    encode: (next, prev) => hitachi424AcSignal(next, prev),
  },
  {
    id: 'hitachi-ac/ras-35tha6',
    kind: 'ac',
    brandId: 'hitachi',
    label: 'Hitachi AC remote RAS-35THA6 (older)',
    caps: HITACHI_CAPS,
    encode: (next) => hitachiAcSignal(next),
  },
];
