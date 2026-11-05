import type { Remote } from '../catalogue';
import { VOLTAS_CAPS, voltasAcSignal } from '../lgpl/voltasAc';
import { guessRemotes, type OemCodeSet } from './oem';

// Indian brands with no remote of their own in the library. Their ACs are thought to be built by
// Midea or Gree, so they get those makers' code sets, every one labelled as a guess. The order
// (Midea's two code sets, then Gree's) follows Midea being the larger maker; nothing here is
// confirmed on a real remote of these brands.
const OEM_GUESSES: OemCodeSet[] = ['coolix', 'midea', 'gree-yaw1f'];

export const BLUE_STAR_REMOTES: Remote[] = guessRemotes('blue-star', 'Blue Star', OEM_GUESSES);
export const GODREJ_REMOTES: Remote[] = guessRemotes('godrej', 'Godrej', OEM_GUESSES);
export const LLOYD_REMOTES: Remote[] = guessRemotes('lloyd', 'Lloyd', OEM_GUESSES);

// Voltas: the library's one Voltas remote (the 122LZF window AC) first, then the OEM guesses,
// since many Voltas splits are said to be OEM-built (unconfirmed).
export const VOLTAS_REMOTES: Remote[] = [
  {
    id: 'voltas-ac/122lzf',
    kind: 'ac',
    brandId: 'voltas',
    label: 'Voltas AC remote 122LZF (window AC; no auto mode)',
    caps: VOLTAS_CAPS,
    encode: (next) => voltasAcSignal(next),
  },
  ...guessRemotes('voltas', 'Voltas', OEM_GUESSES),
];
