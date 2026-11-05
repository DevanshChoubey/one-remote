import type { Remote } from '../catalogue';
import { makerRemote } from './oem';

// Most likely first: the 24-bit Coolix protocol (RG52 / RG57 / RG51 remotes, the classic Midea
// split remote), then the 48-bit MIDEA protocol (RG57A6 / RG66B6 / RG57H4 remotes), as listed by
// the library.
export const MIDEA_REMOTES: Remote[] = [
  makerRemote('midea', 'coolix', 'Midea AC remote RG52D / RG57A7 / RG51 (Coolix)'),
  makerRemote('midea', 'midea', 'Midea AC remote RG57A6 / RG66B6 / RG57H4 (48-bit)'),
];
