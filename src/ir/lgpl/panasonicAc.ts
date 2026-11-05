/*
 * Panasonic air conditioner IR encoder.
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Panasonic.cpp and src/ir_Panasonic.h,
 * Copyright 2015 Kristian Lauszus, Copyright 2017, 2018 David Conran and contributors.
 * The source actually read was IRremoteESP8266 master at commit 1e2f0f3 (version 2.9.0,
 * 2026-01-03). Its release notes list only documentation changes for Panasonic since v2.8.6.
 * Panasonic A/C support there is heavily influenced by ToniA's HeatpumpIR.
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript. Only the pieces that build and send a full state are kept:
 *    IRPanasonicAc::stateReset, setModel, getModel (as a per-model switch), setPower, setMode,
 *    setTemp, setFan, setSwingVertical, setSwingHorizontal, setQuiet, setPowerful, setIon,
 *    fixChecksum, and IRsend::sendPanasonicAC. The setters run in IRac::panasonic's order.
 *  - Clock, timers and the decoder are left out.
 *  - The CKP model is left out: its power is a toggle, so it cannot send a full state.
 *  - Heat mode is not offered by the app, so it is not mapped.
 *  - The setpoint is rounded with Math.round before clamping (upstream takes an integer and truncates);
 *    app setpoints are integers, so the result is the same.
 *  - The state is built in one pure function instead of a stateful class; the saved temperature
 *    (_temp) is fixed at its stateReset value (25). The horizontal swing is the state's, or Middle
 *    (the stateReset _swingh) when it has none. RKR, which upstream's setModel leaves at byte 17 = 0,
 *    only gets a horizontal swing when the state has one (a real RKR message has byte 17 = 0).
 *  - App fan speeds 1..5 are upstream's Min, Low, Medium, High and Max; app swing positions 1..5 are
 *    Highest..Lowest. When both Quiet and Powerful are asked for, Powerful wins (as IRac's order).
 */

import { acSwingH, acSwingV, clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, AcSwingH, AcSwingV, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';

export type PanasonicModel = 'dke' | 'jke' | 'nke' | 'lke' | 'rkr';

/** What every model takes. */
export const PANASONIC_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3, 4, 5],
  setpoint: { min: 16, max: 30 },
  swing: true,
  swingV: true,
  powerful: true,
  quiet: true,
  sleep: false,
};

/** Per model: horizontal swing on DKE and RKR only (upstream), the ion filter on DKE only. */
export function panasonicCaps(model: PanasonicModel): Capabilities {
  switch (model) {
    case 'dke':
      return { ...PANASONIC_CAPS, swingH: true, ion: true };
    case 'rkr':
      return { ...PANASONIC_CAPS, swingH: true };
    default:
      return PANASONIC_CAPS;
  }
}

// Timing constants, microseconds.
const kPanasonicFreq = 36700;
const kPanasonicHdrMark = 3456;
const kPanasonicHdrSpace = 1728;
const kPanasonicBitMark = 432;
const kPanasonicOneSpace = 1296;
const kPanasonicZeroSpace = 432;
const kPanasonicAcSectionGap = 10000;
const kPanasonicAcMessageGap = 100000; // kDefaultMessageGap
const kPanasonicAcSection1Length = 8;

// Protocol constants.
const kPanasonicAcChecksumInit = 0xf4;
const kPanasonicAcStateLength = 27;
const kPanasonicAcAuto = 0;
const kPanasonicAcDry = 2;
const kPanasonicAcCool = 3;
const kPanasonicAcFan = 6;
const kPanasonicAcFanMin = 0;
const kPanasonicAcFanLow = 1;
const kPanasonicAcFanMed = 2;
const kPanasonicAcFanHigh = 3;
const kPanasonicAcFanMax = 4;
const kPanasonicAcFanAuto = 7;
const kPanasonicAcFanDelta = 3;
const kPanasonicAcMinTemp = 16;
const kPanasonicAcMaxTemp = 30;
const kPanasonicAcQuietOffset = 0;
const kPanasonicAcPowerfulOffset = 5; // 0b100000
const kPanasonicAcQuietCkpOffset = kPanasonicAcPowerfulOffset; // CKP and RKR swap the two bits
const kPanasonicAcPowerfulCkpOffset = kPanasonicAcQuietOffset;
const kPanasonicAcSwingVHighest = 0x1;
const kPanasonicAcSwingVHigh = 0x2;
const kPanasonicAcSwingVMiddle = 0x3;
const kPanasonicAcSwingVLow = 0x4;
const kPanasonicAcSwingVLowest = 0x5;
const kPanasonicAcSwingVAuto = 0xf;
const kPanasonicAcSwingHMiddle = 0x6; // _swingh after stateReset
const kPanasonicAcSwingHFullLeft = 0x9;
const kPanasonicAcSwingHLeft = 0xa;
const kPanasonicAcSwingHRight = 0xb;
const kPanasonicAcSwingHFullRight = 0xc;
const kPanasonicAcSwingHAuto = 0xd;
const kPanasonicAcIonFilterByte = 22;
const kPanasonicAcIonFilterOffset = 0;
const kPanasonicAcSavedTemp = 25; // _temp after stateReset (Fan mode is overridden by setTemp below)

// kPanasonicKnownGoodState
const KNOWN_GOOD: readonly number[] = [
  0x02, 0x20, 0xe0, 0x04, 0x00, 0x00, 0x00, 0x06, 0x02, 0x20, 0xe0, 0x04, 0x00, 0x00, 0x00, 0x80,
  0x00, 0x00, 0x00, 0x0e, 0xe0, 0x00, 0x00, 0x81, 0x00, 0x00, 0x00,
];

const MODE: Record<AcMode, number> = {
  cool: kPanasonicAcCool,
  dry: kPanasonicAcDry,
  fan: kPanasonicAcFan,
  auto: kPanasonicAcAuto,
};

const FAN: Record<AcFan, number> = {
  auto: kPanasonicAcFanAuto,
  1: kPanasonicAcFanMin,
  2: kPanasonicAcFanLow,
  3: kPanasonicAcFanMed,
  4: kPanasonicAcFanHigh,
  5: kPanasonicAcFanMax,
};

const SWING_V: Record<AcSwingV, number> = {
  auto: kPanasonicAcSwingVAuto,
  1: kPanasonicAcSwingVHighest,
  2: kPanasonicAcSwingVHigh,
  3: kPanasonicAcSwingVMiddle,
  4: kPanasonicAcSwingVLow,
  5: kPanasonicAcSwingVLowest,
};

const SWING_H: Record<AcSwingH, number> = {
  auto: kPanasonicAcSwingHAuto,
  fullLeft: kPanasonicAcSwingHFullLeft,
  left: kPanasonicAcSwingHLeft,
  middle: kPanasonicAcSwingHMiddle,
  right: kPanasonicAcSwingHRight,
  fullRight: kPanasonicAcSwingHFullRight,
};

/** IRPanasonicAc::calcChecksum: sum of bytes 0..25 plus kPanasonicAcChecksumInit. */
export function panasonicChecksum(state: Uint8Array): number {
  let sum = kPanasonicAcChecksumInit;
  for (let i = 0; i < kPanasonicAcStateLength - 1; i++) sum += state[i] ?? 0;
  return sum & 0xff;
}

/** IRPanasonicAc::setModel. DKE also applies the stored horizontal swing (Middle). */
function setModel(s: number[], model: PanasonicModel): void {
  s[13] = (s[13] ?? 0) & 0xf0;
  s[17] = 0x00;
  s[21] = (s[21] ?? 0) & 0b11101111;
  s[23] = 0x81;
  s[25] = 0x00;
  switch (model) {
    case 'lke':
      s[13] = (s[13] ?? 0) | 0x02;
      s[17] = 0x06;
      break;
    case 'dke':
      s[23] = 0x01;
      s[25] = 0x06;
      s[17] = ((s[17] ?? 0) & 0xf0) | kPanasonicAcSwingHMiddle; // setSwingHorizontal(_swingh)
      break;
    case 'nke':
      s[17] = 0x06;
      break;
    case 'jke':
      break;
    case 'rkr':
      s[13] = (s[13] ?? 0) | 0x08;
      s[23] = 0x89;
      break;
  }
}

/** IRPanasonicAc::setTemp: clamp, then bits 1..5 of byte 14. */
function setTemp(s: number[], celsius: number): void {
  const t = Math.min(kPanasonicAcMaxTemp, Math.max(kPanasonicAcMinTemp, Math.round(celsius)));
  s[14] = ((s[14] ?? 0) & ~(0b11111 << 1)) | (t << 1);
}

const setBit = (s: number[], i: number, offset: number, on: boolean): void => {
  s[i] = on ? (s[i] ?? 0) | (1 << offset) : (s[i] ?? 0) & ~(1 << offset);
};

/** IRPanasonicAc::setSwingHorizontal: DKE and RKR take any direction, NKE and LKE only Middle. */
function setSwingHorizontal(s: number[], model: PanasonicModel, dir: AcSwingH): void {
  let direction = SWING_H[dir];
  switch (model) {
    case 'dke':
    case 'rkr':
      break;
    case 'nke':
    case 'lke':
      direction = kPanasonicAcSwingHMiddle;
      break;
    default:
      return;
  }
  s[17] = ((s[17] ?? 0) & 0xf0) | direction;
}

/** IRPanasonicAc::setQuiet / setPowerful: byte 21, the two bits swapped on RKR (and CKP). */
function setQuietPowerful(
  s: number[],
  model: PanasonicModel,
  quiet: boolean,
  powerful: boolean,
): void {
  const ckp = model === 'rkr';
  const quietBit = ckp ? kPanasonicAcQuietCkpOffset : kPanasonicAcQuietOffset;
  const powerfulBit = ckp ? kPanasonicAcPowerfulCkpOffset : kPanasonicAcPowerfulOffset;
  // setQuiet(quiet), then setPowerful(powerful); turning one on turns the other off.
  setBit(s, 21, quietBit, quiet);
  if (powerful) setBit(s, 21, quietBit, false);
  setBit(s, 21, powerfulBit, powerful);
}

/** The 27-byte state: 8-byte section 1, 19-byte section 2, checksum last. */
export function panasonicAcBytes(s: AcState, model: PanasonicModel): Uint8Array {
  const st = [...KNOWN_GOOD];
  setModel(st, model);
  // setPower
  st[13] = ((st[13] ?? 0) & ~1) | (s.power ? 1 : 0);
  // setMode: Fan mode sets temp 27 and the others restore the saved temp; setTemp below overrides both.
  st[13] = ((st[13] ?? 0) & 0x0f) | (MODE[s.mode] << 4);
  setTemp(st, kPanasonicAcSavedTemp);
  setTemp(st, clampSetpoint(s.setpoint, PANASONIC_CAPS));
  // setFan and setSwingVertical share byte 16.
  st[16] = ((FAN[s.fan] + kPanasonicAcFanDelta) << 4) | SWING_V[acSwingV(s)];
  // setSwingHorizontal: DKE always has one (setModel applied Middle); RKR only when asked.
  if (model !== 'rkr' || s.swingH !== undefined) setSwingHorizontal(st, model, acSwingH(s));
  setQuietPowerful(st, model, s.quiet === true, s.powerful === true);
  // setIon: DKE only.
  if (model === 'dke')
    setBit(st, kPanasonicAcIonFilterByte, kPanasonicAcIonFilterOffset, s.ion === true);
  // fixChecksum
  const out = Uint8Array.from(st);
  out[kPanasonicAcStateLength - 1] = panasonicChecksum(out);
  return out;
}

/** sendGeneric for one section: header, bytes LSB first, footer mark, gap. */
function section(bytes: Uint8Array, gap: number, out: number[]): void {
  out.push(kPanasonicHdrMark, kPanasonicHdrSpace);
  for (const byte of bytes) {
    for (let bit = 0; bit < 8; bit++) {
      out.push(kPanasonicBitMark, (byte >> bit) & 1 ? kPanasonicOneSpace : kPanasonicZeroSpace);
    }
  }
  out.push(kPanasonicBitMark, gap);
}

/** IRsend::sendPanasonicAC, one message, no repeat. */
export function panasonicBytesToSignal(state: Uint8Array): IrSignal {
  const pattern: number[] = [];
  section(state.subarray(0, kPanasonicAcSection1Length), kPanasonicAcSectionGap, pattern);
  section(state.subarray(kPanasonicAcSection1Length), kPanasonicAcMessageGap, pattern);
  return { freqHz: kPanasonicFreq, pattern };
}

export function panasonicAcSignal(s: AcState, model: PanasonicModel): IrSignal {
  return panasonicBytesToSignal(panasonicAcBytes(s, model));
}
