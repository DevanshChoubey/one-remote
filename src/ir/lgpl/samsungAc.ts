/*
 * Samsung air conditioner IR encoder (SAMSUNG_AC, 14 or 21 bytes).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Samsung.cpp and src/ir_Samsung.h, and the
 * IRac::samsung mapping in src/IRac.cpp, Copyright 2009 Ken Shirriff, Copyright 2017, 2018-2021
 * David Conran and contributors. The source actually read was master at commit 1e2f0f3
 * (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as one pure function. Kept: IRSamsungAc::stateReset, setPower,
 *    setMode, setTemp, setFan, setSwing, setSwingH, checksum, send, sendExtended and
 *    IRsend::sendSamsungAC.
 *  - Heat, quiet, powerful, econo, breeze, ion, clean, beep, timers and the sleep timer are left
 *    out (the sleep timer needs a duration the app does not have). The display stays on, as after
 *    stateReset.
 *  - Upstream remembers the last power state sent in the class; here it comes from `prev`. As in
 *    IRac::sendAc, an unknown previous power is taken as different, so the extended message goes.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBits } from './irsend';

export const SAMSUNG_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: 16, max: 30 },
  swing: true,
  sleep: false,
};

const kSamsungAcHdrMark = 690;
const kSamsungAcHdrSpace = 17844;
const kSamsungAcSectionMark = 3086;
const kSamsungAcSectionSpace = 8864;
const kSamsungAcSectionGap = 2886;
const kSamsungAcBitMark = 586;
const kSamsungAcOneSpace = 1432;
const kSamsungAcZeroSpace = 436;
const kDefaultMessageGap = 100000;
const kSamsungAcSectionLength = 7;
const kSamsungAcStateLength = 14;

const kSamsungAcMinTemp = 16;
const kSamsungAcAuto = 0;
const kSamsungAcCool = 1;
const kSamsungAcDry = 2;
const kSamsungAcFan = 3;
const kSamsungAcFanAuto = 0;
const kSamsungAcFanLow = 2;
const kSamsungAcFanMed = 4;
const kSamsungAcFanHigh = 5;
const kSamsungAcFanAuto2 = 6;
const kSamsungAcSwingV = 0b010;
const kSamsungAcSwingH = 0b011;
const kSamsungAcSwingBoth = 0b100;
const kSamsungAcSwingOff = 0b111;

// IRSamsungAc::stateReset kReset (the first 14 bytes are the normal message).
const RESET: readonly number[] = [
  0x02, 0x92, 0x0f, 0x00, 0x00, 0x00, 0xf0, 0x01, 0x02, 0xae, 0x71, 0x00, 0x15, 0xf0,
];
const EXTENDED_MIDDLE: readonly number[] = [0x01, 0xd2, 0x0f, 0x00, 0x00, 0x00, 0x00];

const MODE: Record<AcMode, number> = {
  cool: kSamsungAcCool,
  dry: kSamsungAcDry,
  fan: kSamsungAcFan,
  auto: kSamsungAcAuto,
};
const FAN: Record<AcFan, number> = {
  auto: kSamsungAcFanAuto,
  1: kSamsungAcFanLow,
  2: kSamsungAcFanMed,
  3: kSamsungAcFanHigh,
};

const popcount = (v: number): number => {
  let n = 0;
  for (let x = v & 0xff; x; x >>= 1) n += x & 1;
  return n;
};

/** IRSamsungAc::calcSectionChecksum for the 7-byte section at `at`. */
export function samsungSectionChecksum(b: ArrayLike<number>, at: number): number {
  let sum = popcount(b[at] ?? 0);
  sum += popcount((b[at + 1] ?? 0) & 0x0f);
  sum += popcount((b[at + 2] ?? 0) >> 4);
  for (let i = 3; i < 7; i++) sum += popcount(b[at + i] ?? 0);
  return (sum ^ 0xff) & 0xff;
}

/** IRSamsungAc::checksum, for every whole section. */
function checksum(b: number[]): void {
  for (let at = 0; at + kSamsungAcSectionLength <= b.length; at += kSamsungAcSectionLength) {
    const sum = samsungSectionChecksum(b, at);
    setBits(b, at + 1, 4, 4, sum & 0x0f);
    setBits(b, at + 2, 0, 4, sum >> 4);
  }
}

/** IRSamsungAc::setMode: Auto has its own fan setting. */
function setMode(b: number[], mode: number): void {
  setBits(b, 12, 4, 3, mode);
  const fan = ((b[12] ?? 0) >> 1) & 0b111;
  if (mode === kSamsungAcAuto) setBits(b, 12, 1, 3, kSamsungAcFanAuto2);
  else if (fan === kSamsungAcFanAuto2) setBits(b, 12, 1, 3, kSamsungAcFanAuto);
}

/** IRSamsungAc::setFan: the normal speeds are refused in Auto mode. */
function setFan(b: number[], speed: number): void {
  const mode = ((b[12] ?? 0) >> 4) & 0b111;
  if (mode === kSamsungAcAuto) return;
  setBits(b, 12, 1, 3, speed);
}

/** IRSamsungAc::setSwing (vertical), then setSwingH(false). */
function setSwing(b: number[], on: boolean): void {
  const cur = ((b[9] ?? 0) >> 4) & 0b111;
  let next =
    cur === kSamsungAcSwingBoth || cur === kSamsungAcSwingH
      ? on
        ? kSamsungAcSwingBoth
        : kSamsungAcSwingH
      : on
        ? kSamsungAcSwingV
        : kSamsungAcSwingOff;
  // setSwingH(false)
  if (next === kSamsungAcSwingBoth) next = kSamsungAcSwingV;
  else if (next === kSamsungAcSwingH) next = kSamsungAcSwingOff;
  setBits(b, 9, 4, 3, next);
}

/**
 * The bytes IRac::samsung sends for `s`: the normal 14-byte message, or the 21-byte extended one
 * when the power changes (or the previous power is unknown).
 */
export function samsungAcBytes(s: AcState, prev?: AcState): Uint8Array {
  const b = [...RESET];
  const pw = s.power ? 0b11 : 0b00;
  setBits(b, 6, 4, 2, pw); // Power1
  setBits(b, 13, 4, 2, pw); // Power2
  setMode(b, MODE[s.mode]);
  setBits(b, 11, 4, 4, clampSetpoint(Math.round(s.setpoint), SAMSUNG_CAPS) - kSamsungAcMinTemp);
  setFan(b, FAN[s.fan]);
  setSwing(b, s.swing);
  setMode(b, MODE[s.mode]); // IRac does setMode() again, as it can affect the fan speed.
  if (prev !== undefined && prev.power === s.power) {
    checksum(b);
    return Uint8Array.from(b);
  }
  // sendExtended: section 2 moves to section 3, the extended middle section goes in between.
  const ext = [...b.slice(0, 7), ...EXTENDED_MIDDLE, ...b.slice(7, 14)];
  // _setOnTimer and _setSleepTimer with no timers: every timer field and Sleep5/Sleep12 cleared.
  setBits(ext, 9, 4, 4, 0);
  setBits(ext, 10, 0, 8, 0);
  setBits(ext, 11, 0, 4, 0);
  setBits(ext, 12, 0, 5, 0);
  setBits(ext, 5, 4, 1, 0);
  checksum(ext);
  return Uint8Array.from(ext);
}

/** IRsend::sendSamsungAC, no repeat. */
export function samsungBytesToSignal(bytes: ArrayLike<number>): IrSignal {
  if (bytes.length < kSamsungAcStateLength || bytes.length % kSamsungAcSectionLength) {
    throw new Error('a Samsung AC message is 14 or 21 bytes');
  }
  const t = {
    hdrMark: kSamsungAcSectionMark,
    hdrSpace: kSamsungAcSectionSpace,
    oneMark: kSamsungAcBitMark,
    oneSpace: kSamsungAcOneSpace,
    zeroMark: kSamsungAcBitMark,
    zeroSpace: kSamsungAcZeroSpace,
    footerMark: kSamsungAcBitMark,
    gap: kSamsungAcSectionGap,
  };
  const p = new PulseBuilder(38000).mark(kSamsungAcHdrMark).space(kSamsungAcHdrSpace);
  for (let at = 0; at < bytes.length; at += kSamsungAcSectionLength) {
    const section = Array.from(bytes).slice(at, at + kSamsungAcSectionLength);
    p.genericBytes(t, section, false);
  }
  return p.space(kDefaultMessageGap - kSamsungAcSectionGap).signal();
}

export function samsungAcSignal(s: AcState, prev?: AcState): IrSignal {
  return samsungBytesToSignal(samsungAcBytes(s, prev));
}
