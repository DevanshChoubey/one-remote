import type { Remote } from '../catalogue';
import {
  MHI152_CAPS,
  MHI88_CAPS,
  mitsubishiHeavy152AcSignal,
  mitsubishiHeavy88AcSignal,
} from '../lgpl/mitsubishiHeavyAc';

// Most likely first: the 152-bit RLA502A700B remote (SRKxxZM-S and SRKxxZMXA-S units), then the
// 88-bit RKX502A001C remote (SRKxxZJ-S units), as listed by the library.
export const MITSUBISHI_HEAVY_REMOTES: Remote[] = [
  {
    id: 'mitsubishi-heavy-ac/rla502a700b',
    kind: 'ac',
    brandId: 'mitsubishi-heavy',
    label: 'Mitsubishi Heavy AC remote RLA502A700B (SRK ZM-S)',
    caps: MHI152_CAPS,
    encode: (next) => mitsubishiHeavy152AcSignal(next),
  },
  {
    id: 'mitsubishi-heavy-ac/rkx502a001c',
    kind: 'ac',
    brandId: 'mitsubishi-heavy',
    label: 'Mitsubishi Heavy AC remote RKX502A001C (SRK ZJ-S)',
    caps: MHI88_CAPS,
    encode: (next) => mitsubishiHeavy88AcSignal(next),
  },
];
