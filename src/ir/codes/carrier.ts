import type { Remote } from '../catalogue';
import { CARRIER64_CAPS, carrier64AcSignal } from '../lgpl/carrierAc';
import { guessRemotes } from './oem';

/** CARRIER_AC64: the Carrier remote the library controls (cool and fan only). */
export const CARRIER64_REMOTE: Remote = {
  id: 'carrier-ac/ac64',
  kind: 'ac',
  brandId: 'carrier',
  label: 'Carrier AC remote (64-bit, cool and fan only)',
  caps: CARRIER64_CAPS,
  encode: (next) => carrier64AcSignal(next),
};

// Carrier's Indian ACs come from its joint venture with Midea, so the two Midea code sets come
// first, as guesses. CARRIER_AC64 is the one Carrier protocol the library builds from settings.
export const CARRIER_REMOTES: Remote[] = [
  ...guessRemotes('carrier', 'Carrier', ['coolix', 'midea']),
  CARRIER64_REMOTE,
];
