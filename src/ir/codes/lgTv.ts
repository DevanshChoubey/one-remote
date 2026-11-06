import type { Remote } from '../catalogue';
import { necSignal } from '../nec';

/** LG TV NEC codes (address 0x04). `powerOn` is the discrete on code, so tv.powerOn stays idempotent. */
export const LG_TV_REMOTE: Remote = {
  id: 'lg-tv/nec',
  kind: 'tv',
  brandId: 'lg-tv',
  label: 'LG TV',
  keys: {
    power: necSignal(0x20df10ef),
    powerOn: necSignal(0x20df23dc),
    volumeUp: necSignal(0x20df40bf),
    volumeDown: necSignal(0x20dfc03f),
    mute: necSignal(0x20df906f),
  },
};
