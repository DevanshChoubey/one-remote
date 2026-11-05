import type { Remote } from '../catalogue';
import { COOLIX_CAPS, coolixAcSignal } from '../lgpl/coolixAc';
import { GREE_CAPS, greeAcSignal } from '../lgpl/greeAc';
import { MIDEA_CAPS, mideaAcSignal } from '../lgpl/mideaAc';

/**
 * The code sets of the big OEM makers (Midea and Gree), which build ACs sold under many brand
 * names. `coolix` and `midea` are the two Midea protocols, `gree-yaw1f` and `gree-ybofb` the two
 * Gree remote variants.
 */
export type OemCodeSet = 'coolix' | 'midea' | 'gree-yaw1f' | 'gree-ybofb';

const NAMES: Record<OemCodeSet, string> = {
  coolix: 'Midea Coolix code set',
  midea: 'Midea 48-bit code set',
  'gree-yaw1f': 'Gree code set (YAW1F remote)',
  'gree-ybofb': 'Gree code set (YBOFB remote)',
};

/** A maker's own remote, labelled with the remote models the library lists. */
export function makerRemote(brandId: string, set: OemCodeSet, label: string): Remote {
  const base = { id: `${brandId}-ac/${set}`, kind: 'ac' as const, brandId, label };
  switch (set) {
    case 'coolix':
      return { ...base, caps: COOLIX_CAPS, encode: (next, prev) => coolixAcSignal(next, prev) };
    case 'midea':
      return { ...base, caps: MIDEA_CAPS, encode: (next, prev) => mideaAcSignal(next, prev) };
    case 'gree-yaw1f':
      return { ...base, caps: GREE_CAPS, encode: (next) => greeAcSignal(next, 'yaw1f') };
    case 'gree-ybofb':
      return { ...base, caps: GREE_CAPS, encode: (next) => greeAcSignal(next, 'ybofb') };
  }
}

/**
 * Guessed remotes for a brand whose ACs are thought to be made by Midea or Gree. Nothing here is
 * confirmed on a real remote of that brand, and the label says so.
 */
export function guessRemotes(brandId: string, brandName: string, sets: OemCodeSet[]): Remote[] {
  return sets.map((set) =>
    makerRemote(brandId, set, `${brandName} AC: try the ${NAMES[set]} (a guess, unconfirmed)`),
  );
}
