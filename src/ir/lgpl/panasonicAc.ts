/*
 * Panasonic air conditioner IR encoder.
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Panasonic.cpp and src/ir_Panasonic.h,
 * Copyright 2015 Kristian Lauszus, Copyright 2017, 2018 David Conran and contributors.
 * Panasonic A/C support there is heavily influenced by ToniA's HeatpumpIR.
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript. Only the pieces that build and send a full state are kept:
 *    IRPanasonicAc::stateReset, setModel, setPower, setMode, setTemp, setFan, setSwingVertical,
 *    fixChecksum, and IRsend::sendPanasonicAC.
 *  - Clock, timers, quiet, powerful, ion filter, horizontal swing control and the decoder are left out.
 *  - The CKP model is left out: its power is a toggle, so it cannot send a full state.
 *  - Heat mode is not offered by the app, so it is not mapped.
 *  - The state is built in one pure function instead of a stateful class; the saved temperature
 *    (_temp) and horizontal swing (_swingh) are fixed at their stateReset values (25 and Middle).
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';

export type PanasonicModel = 'dke' | 'jke' | 'nke' | 'lke' | 'rkr';

export const PANASONIC_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: 16, max: 30 },
  swing: true,
  sleep: false,
};

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
const kPanasonicAcFanLow = 1;
const kPanasonicAcFanMed = 2;
const kPanasonicAcFanHigh = 3;
const kPanasonicAcFanAuto = 7;
const kPanasonicAcFanDelta = 3;
const kPanasonicAcMinTemp = 16;
const kPanasonicAcMaxTemp = 30;
const kPanasonicAcSwingVMiddle = 0x3;
const kPanasonicAcSwingVAuto = 0xf;
const kPanasonicAcSwingHMiddle = 0x6; // _swingh after stateReset
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
  1: kPanasonicAcFanLow,
  2: kPanasonicAcFanMed,
  3: kPanasonicAcFanHigh,
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
  const swing = s.swing ? kPanasonicAcSwingVAuto : kPanasonicAcSwingVMiddle;
  st[16] = ((FAN[s.fan] + kPanasonicAcFanDelta) << 4) | swing;
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
