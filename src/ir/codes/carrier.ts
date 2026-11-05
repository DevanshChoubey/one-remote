import type { Remote } from '../catalogue';
import { CARRIER64_CAPS, carrier64AcSignal } from '../lgpl/carrierAc';

/** CARRIER_AC64: the Carrier remote the library controls (cool and fan only). */
export const CARRIER64_REMOTE: Remote = {
  id: 'carrier-ac/ac64',
  kind: 'ac',
  brandId: 'carrier',
  label: 'Carrier AC remote (64-bit, cool and fan only)',
  caps: CARRIER64_CAPS,
  encode: (next) => carrier64AcSignal(next),
};

export const CARRIER_REMOTES: Remote[] = [CARRIER64_REMOTE];
