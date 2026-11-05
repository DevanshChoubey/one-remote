/*
 * Mitsubishi Heavy Industries air conditioner IR encoders (MITSUBISHI_HEAVY_152 and
 * MITSUBISHI_HEAVY_88).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_MitsubishiHeavy.cpp and src/ir_MitsubishiHeavy.h,
 * invertBytePairs in src/IRutils.cpp, and the IRac::mitsubishiHeavy152 and IRac::mitsubishiHeavy88
 * mappings in src/IRac.cpp, Copyright 2019 David Conran and contributors. The source actually read
 * was master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRMitsubishiHeavy152Ac stateReset,
 *    checksum, setPower, setMode, setTemp, setFan, setSwingVertical, setSwingHorizontal,
 *    setSilent(false), setTurbo(false), setEcono(false), setClean(false), setFilter(false),
 *    setNight, convertMode, convertFan, convertSwingV, convertSwingH; IRMitsubishiHeavy88Ac
 *    stateReset, checksum, setPower, setMode, setTemp, setFan, setSwingVertical,
 *    setSwingHorizontal, setTurbo(false), setEcono(false), setClean(false), convertMode,
 *    convertFan, convertSwingV, convertSwingH; and IRsend::sendMitsubishiHeavy152 / 88 (no
 *    repeats).
 *  - The setter sequence IRac runs on a fresh object is folded into one function each, giving the
 *    same bytes.
 *  - Heat, quiet, turbo, econo, clean, filter and 3D are left out. Horizontal swing is off, as IRac
 *    sends it by default.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBit, setBits, type GenericTiming } from './irsend';

const kMitsubishiHeavyHdrMark = 3140;
const kMitsubishiHeavyHdrSpace = 1630;
const kMitsubishiHeavyBitMark = 370;
const kMitsubishiHeavyOneSpace = 420;
const kMitsubishiHeavyZeroSpace = 1220;
const kMitsubishiHeavyGap = 100000; // kDefaultMessageGap

const kMitsubishiHeavy152StateLength = 19;
const kMitsubishiHeavy88StateLength = 11;
const kMitsubishiHeavySigLength = 5;
const kMitsubishiHeavyZmsSig = [0xad, 0x51, 0x3c, 0xe5, 0x1a];
const kMitsubishiHeavyZjsSig = [0xad, 0x51, 0x3c, 0xd9, 0x26];
const kMitsubishiHeavyMinTemp = 17;
const kMitsubishiHeavyMaxTemp = 31;

const kMitsubishiHeavy152SwingVAuto = 0;
const kMitsubishiHeavy152SwingVOff = 6;
const kMitsubishiHeavy152SwingHOff = 8;
const kMitsubishiHeavy88SwingVOff = 0b000;
const kMitsubishiHeavy88SwingVAuto = 0b100;
const kMitsubishiHeavy88SwingHOff = 0b0000;

const caps = (sleep: boolean): Capabilities => ({
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kMitsubishiHeavyMinTemp, max: kMitsubishiHeavyMaxTemp },
  swing: true,
  sleep,
});

/** The 152-bit remote has a Night (sleep) button; the 88-bit one does not. */
export const MHI152_CAPS = caps(true);
export const MHI88_CAPS = caps(false);

/** IRMitsubishiHeavy152Ac::convertMode (shared by the 88-bit class). */
const MODE: Record<AcMode, number> = { auto: 0, cool: 1, dry: 2, fan: 3 };

/** IRMitsubishiHeavy152Ac::convertFan: low 1, medium 2, high 3, auto 0. */
const FAN152: Record<AcFan, number> = { auto: 0x0, 1: 0x1, 2: 0x2, 3: 0x3, 4: 0x3, 5: 0x3 };
/** IRMitsubishiHeavy88Ac::convertFan: low 2, medium 3, high 4, auto 0. */
const FAN88: Record<AcFan, number> = { auto: 0, 1: 2, 2: 3, 3: 4, 4: 4, 5: 4 };

/** invertBytePairs from byte 3 (the protocol's "checksum"): each odd byte is the one before, inverted. */
function invertBytePairs(raw: number[]): void {
  for (let i = kMitsubishiHeavySigLength - 1; i < raw.length; i += 2) {
    raw[i] = ~(raw[i - 1] ?? 0) & 0xff;
  }
}

function temp(s: AcState, c: Capabilities): number {
  return Math.round(clampSetpoint(s.setpoint, c)) - kMitsubishiHeavyMinTemp;
}

/** The 19-byte MITSUBISHI_HEAVY_152 (ZMS) state, as IRac::mitsubishiHeavy152 builds it. */
export function mhi152Bytes(s: AcState): number[] {
  const raw = new Array<number>(kMitsubishiHeavy152StateLength).fill(0);
  kMitsubishiHeavyZmsSig.forEach((b, i) => (raw[i] = b));
  raw[17] = 0x80;
  setBit(raw, 5, 3, s.power); // Power
  setBits(raw, 5, 0, 3, MODE[s.mode]); // Mode
  setBits(raw, 7, 0, 4, temp(s, MHI152_CAPS)); // Temp
  setBits(raw, 9, 0, 4, FAN152[s.fan]); // Fan
  const swingV = s.swing ? kMitsubishiHeavy152SwingVAuto : kMitsubishiHeavy152SwingVOff;
  setBits(raw, 11, 5, 3, swingV); // SwingV
  setBits(raw, 13, 0, 4, kMitsubishiHeavy152SwingHOff); // SwingH
  setBit(raw, 15, 7, false); // Silent
  setBit(raw, 5, 5, false); // Clean
  setBit(raw, 5, 6, false); // Filter
  setBit(raw, 15, 6, s.sleep); // Night
  invertBytePairs(raw);
  return raw;
}

/** The 11-byte MITSUBISHI_HEAVY_88 (ZJS) state, as IRac::mitsubishiHeavy88 builds it. */
export function mhi88Bytes(s: AcState): number[] {
  const raw = new Array<number>(kMitsubishiHeavy88StateLength).fill(0);
  kMitsubishiHeavyZjsSig.forEach((b, i) => (raw[i] = b));
  setBit(raw, 9, 3, s.power); // Power
  setBits(raw, 9, 0, 3, MODE[s.mode]); // Mode
  setBits(raw, 9, 4, 4, temp(s, MHI88_CAPS)); // Temp
  setBits(raw, 7, 5, 3, FAN88[s.fan]); // Fan
  const swingV = s.swing ? kMitsubishiHeavy88SwingVAuto : kMitsubishiHeavy88SwingVOff;
  setBits(raw, 5, 1, 1, swingV & 1); // SwingV5
  setBits(raw, 7, 3, 2, swingV >> 1); // SwingV7
  setBits(raw, 5, 2, 2, kMitsubishiHeavy88SwingHOff & 0b11); // SwingH1
  setBits(raw, 5, 6, 2, kMitsubishiHeavy88SwingHOff >> 2); // SwingH2
  setBit(raw, 5, 5, false); // Clean
  invertBytePairs(raw);
  return raw;
}

/** IRsend::sendMitsubishiHeavy88 / 152 (LSB first). */
export function mhiBytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kMitsubishiHeavyHdrMark,
    hdrSpace: kMitsubishiHeavyHdrSpace,
    oneMark: kMitsubishiHeavyBitMark,
    oneSpace: kMitsubishiHeavyOneSpace,
    zeroMark: kMitsubishiHeavyBitMark,
    zeroSpace: kMitsubishiHeavyZeroSpace,
    footerMark: kMitsubishiHeavyBitMark,
    gap: kMitsubishiHeavyGap,
  };
  return new PulseBuilder(38000).genericBytes(t, raw, false).signal();
}

export function mitsubishiHeavy152AcSignal(s: AcState): IrSignal {
  return mhiBytesToSignal(mhi152Bytes(s));
}

export function mitsubishiHeavy88AcSignal(s: AcState): IrSignal {
  return mhiBytesToSignal(mhi88Bytes(s));
}
