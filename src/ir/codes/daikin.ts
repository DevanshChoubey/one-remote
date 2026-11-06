import type { Remote } from '../catalogue';
import { DAIKIN_CAPS, daikinAcSignal, type DaikinProtocol } from '../lgpl/daikinAc';

// Most likely first: the library lists DAIKIN (280 bits) for the common ARC433 / ARC466 / ARC443
// split remotes; DAIKIN216 is the ARC433B69 / ARC484A4 family.
const MODELS: { id: string; protocol: DaikinProtocol; label: string }[] = [
  { id: 'arc466', protocol: 'daikin', label: 'Daikin AC remote ARC466 / ARC433 / ARC443' },
  { id: 'arc433b69', protocol: 'daikin216', label: 'Daikin AC remote ARC433B69 / ARC484A4' },
];

export const DAIKIN_REMOTES: Remote[] = MODELS.map(({ id, protocol, label }) => ({
  id: `daikin-ac/${id}`,
  kind: 'ac',
  brandId: 'daikin',
  label,
  caps: DAIKIN_CAPS,
  encode: (next) => daikinAcSignal(next, protocol),
}));
