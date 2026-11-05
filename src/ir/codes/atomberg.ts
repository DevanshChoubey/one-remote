/*
 * Atomberg fan IR codes, from Flipper-IRDB (https://github.com/Lucaslhm/Flipper-IRDB),
 * Fans/Atomberg/Atomberg_fan.ir, CC0-1.0 (public domain). See ATTRIBUTION.md.
 *
 * The file lists NECext frames with address 00 F3. Flipper writes each byte LSB first; necSignal
 * takes the 32-bit frame MSB first, so every byte is bit-reversed (address 00 F3 -> 0x00CF).
 *
 * Flipper button to FanKey mapping:
 *   POWER -> off     (a toggle on the fan: it turns an off fan on as well; verified on a real fan)
 *   1..5  -> speed1..speed5
 *   BOOST -> boost, SLEEP -> sleep, LED -> light
 * TIMER is one cycling button, which does not fit the discrete timer keys, so it is left out.
 */

import type { Capabilities } from '@/core';
import type { FanKey, Remote } from '../catalogue';
import type { IrSignal } from '../emitter';
import { necSignal } from '../nec';

const FRAMES: Partial<Record<FanKey, number>> = {
  off: 0x00cf8976,
  speed1: 0x00cfd12e,
  speed2: 0x00cf09f6,
  speed3: 0x00cf51ae,
  speed4: 0x00cfc936,
  speed5: 0x00cf11ee,
  boost: 0x00cff10e,
  sleep: 0x00cf718e,
  light: 0x00cfe916,
};

const keys: Partial<Record<FanKey, IrSignal>> = {};
for (const [key, frame] of Object.entries(FRAMES)) keys[key as FanKey] = necSignal(frame);

const caps: Capabilities = { fanLight: true, sleep: true, fanBoost: true, fanTimer: false };

export const ATOMBERG_REMOTES: Remote[] = [
  { id: 'atomberg-fan/nec', kind: 'fan', brandId: 'atomberg', label: 'Atomberg fan', caps, keys },
];
