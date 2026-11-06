import type { Remote } from '../catalogue';
import { makerRemote } from './oem';

// Most likely first: the YAW1F remote (the library's default Gree model), then the YBOFB remote.
// The two differ only in one bit that YAW1F sets while the unit is on.
export const GREE_REMOTES: Remote[] = [
  makerRemote('gree', 'gree-yaw1f', 'Gree AC remote (YAW1F type)'),
  makerRemote('gree', 'gree-ybofb', 'Gree AC remote (YBOFB type)'),
];
