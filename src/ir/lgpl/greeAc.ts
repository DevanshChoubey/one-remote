/*
 * Gree air conditioner IR encoder (GREE).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Gree.cpp and src/ir_Gree.h,
 * IRKelvinatorAC::calcBlockChecksum in src/ir_Kelvinator.cpp, and the IRac::gree mapping in
 * src/IRac.cpp, Copyright 2017 Ville Skyttä (scop), Copyright 2016-2022 David Conran and
 * contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRGreeAC stateReset, fixup, checksum,
 *    setModel (YAW1F and YBOFB), setPower, setMode, setTemp (Celsius), setFan, setSwingVertical,
 *    setSwingHorizontal, setSleep, convertMode, convertSwingV, convertSwingH; and
 *    IRsend::sendGree (no repeats).
 *  - The setter sequence IRac runs on a fresh object is folded into one function, giving the same
 *    bytes.
 *  - Fan 1, 2 and 3 are sent as Gree's own speeds 1, 2 and 3. IRGreeAC::convertFan sends both
 *    low and medium as 2, which would make two of our three speeds the same; speed 1 is what the
 *    real YBOFB and YAW1F remotes send for their lowest speed (TestGreeClass.Issue814Power).
 *  - The light is left on, as the reset state and the real remotes have it; IRac would send it
 *    off unless asked. Heat, Fahrenheit, turbo, econo, iFeel, X-Fan, the timer and the display
 *    source are left out, and horizontal swing is off.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBit, setBits, type GenericTiming } from './irsend';

export type GreeModel = 'yaw1f' | 'ybofb';

const kGreeHdrMark = 9000;
const kGreeHdrSpace = 4500;
const kGreeBitMark = 620;
const kGreeOneSpace = 1600;
const kGreeZeroSpace = 540;
const kGreeMsgSpace = 19980;
const kGreeBlockFooter = 0b010;
const kGreeBlockFooterBits = 3;
const kGreeStateLength = 8;

const kGreeMinTempC = 16;
const kGreeMaxTempC = 30;
const kGreeAutoTemp = 25;
const kGreeSwingLastPos = 0b0000;
const kGreeSwingAuto = 0b0001;
const kGreeSwingHOff = 0b000;
const kKelvinatorChecksumStart = 10;

export const GREE_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kGreeMinTempC, max: kGreeMaxTempC },
  swing: true,
  sleep: true,
};

/** IRGreeAC::convertMode. */
const MODE: Record<AcMode, number> = { auto: 0, cool: 1, dry: 2, fan: 3 };
/** Gree's own speeds (see the header): auto 0, then 1 to 3. */
const FAN: Record<AcFan, number> = { auto: 0, 1: 1, 2: 2, 3: 3, 4: 3, 5: 3 };

/** IRKelvinatorAC::calcBlockChecksum, as IRGreeAC::checksum uses it (the top nibble of byte 7). */
export function greeChecksum(raw: ArrayLike<number>): number {
  let sum = kKelvinatorChecksumStart;
  for (let i = 0; i < 4; i++) sum += (raw[i] ?? 0) & 0x0f;
  for (let i = 4; i < kGreeStateLength - 1; i++) sum += (raw[i] ?? 0) >> 4;
  return sum & 0x0f;
}

/** The 8-byte state, as IRac::gree builds it on a fresh object. */
export function greeBytes(s: AcState, model: GreeModel): number[] {
  // stateReset: power off, auto, 25C, light on, the two fixed "unknown" fields.
  const raw = [0x00, 0x09, 0x20, 0x50, 0x00, 0x20, 0x00, 0x00];
  setBits(raw, 0, 0, 3, MODE[s.mode]); // Mode
  const temp = s.mode === 'auto' ? kGreeAutoTemp : Math.round(clampSetpoint(s.setpoint, GREE_CAPS));
  setBits(raw, 1, 0, 4, temp - kGreeMinTempC); // Temp
  setBit(raw, 3, 2, false); // TempExtraDegreeF
  setBit(raw, 3, 3, false); // UseFahrenheit
  setBits(raw, 0, 4, 2, s.mode === 'dry' ? 1 : FAN[s.fan]); // Fan (dry is locked to 1)
  setBit(raw, 0, 6, s.swing); // SwingAuto
  setBits(raw, 4, 0, 4, s.swing ? kGreeSwingAuto : kGreeSwingLastPos); // SwingV
  setBits(raw, 4, 4, 3, kGreeSwingHOff); // SwingH
  setBit(raw, 0, 7, s.sleep); // Sleep
  setBit(raw, 0, 3, s.power); // Power
  setBit(raw, 2, 6, s.power && model === 'yaw1f'); // ModelA
  setBits(raw, 7, 4, 4, greeChecksum(raw)); // Sum
  return raw;
}

/** IRsend::sendGree: two 4-byte blocks, LSB first, with a 3-bit footer after the first. */
export function greeBytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kGreeHdrMark,
    hdrSpace: kGreeHdrSpace,
    oneMark: kGreeBitMark,
    oneSpace: kGreeOneSpace,
    zeroMark: kGreeBitMark,
    zeroSpace: kGreeZeroSpace,
    footerMark: kGreeBitMark,
    gap: kGreeMsgSpace,
  };
  const bytes = Array.from(raw);
  return new PulseBuilder(38000)
    .header(t)
    .bytes(t, bytes.slice(0, 4), false)
    .data(t, kGreeBlockFooter, kGreeBlockFooterBits, false)
    .footer(t)
    .bytes(t, bytes.slice(4), false)
    .footer(t)
    .signal();
}

export function greeAcSignal(s: AcState, model: GreeModel): IrSignal {
  return greeBytesToSignal(greeBytes(s, model));
}
