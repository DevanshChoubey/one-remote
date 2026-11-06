/*
 * Hitachi air conditioner IR encoders (HITACHI_AC, 28 bytes, and HITACHI_AC424, 53 bytes).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Hitachi.cpp and src/ir_Hitachi.h, invertBytePairs in
 * src/IRutils.cpp, and the IRac::hitachi / IRac::hitachi424 mappings and IRac::handleToggles in
 * src/IRac.cpp, Copyright 2018-2019 David Conran and contributors. The source actually read was
 * master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRHitachiAc stateReset, calcChecksum,
 *    setPower, setMode, setTemp, setFan, setSwingVertical, setSwingHorizontal, convertMode,
 *    convertFan; IRHitachiAc424 stateReset, setInvertedStates, setPower, setMode, setTemp, setFan,
 *    setButton, setSwingVToggle, convertMode, convertFan; IRsend::sendHitachiAC and
 *    sendHitachiAc424 (no repeats).
 *  - The setter sequence IRac runs on a fresh object is folded into one function each, giving the
 *    same bytes. Heat is left out; HITACHI_AC424 has no auto mode, so it is not offered.
 *  - HITACHI_AC horizontal swing is always off. HITACHI_AC424 vertical swing is a toggle button;
 *    the previous swing comes from `prev` (unknown is taken as off, as IRac does without a
 *    previous state).
 *  - The other Hitachi protocols (AC1, AC2, AC3, AC264, AC296, AC344) are left out.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, reverseBits, setBit, setBits, type GenericTiming } from './irsend';

const kHitachiAcFreq = 38000;
const kHitachiAcHdrMark = 3300;
const kHitachiAcHdrSpace = 1700;
const kHitachiAcBitMark = 400;
const kHitachiAcOneSpace = 1250;
const kHitachiAcZeroSpace = 500;
const kHitachiAcMinGap = 100000; // kDefaultMessageGap
const kHitachiAcStateLength = 28;

const kHitachiAcAuto = 2;
const kHitachiAcCool = 4;
const kHitachiAcDry = 5;
const kHitachiAcFan = 0xc;
const kHitachiAcFanAuto = 1;
const kHitachiAcFanLow = 2;
const kHitachiAcFanHigh = 5;
const kHitachiAcMinTemp = 16;
const kHitachiAcMaxTemp = 32;

const kHitachiAc424LdrMark = 29784;
const kHitachiAc424LdrSpace = 49290;
const kHitachiAc424HdrMark = 3416;
const kHitachiAc424HdrSpace = 1604;
const kHitachiAc424BitMark = 463;
const kHitachiAc424OneSpace = 1208;
const kHitachiAc424ZeroSpace = 372;
const kHitachiAc424StateLength = 53;

const kHitachiAc424ButtonPowerMode = 0x13;
const kHitachiAc424ButtonSwingV = 0x81;
const kHitachiAc424MinTemp = 16;
const kHitachiAc424MaxTemp = 32;
const kHitachiAc424Fan = 1;
const kHitachiAc424Cool = 3;
const kHitachiAc424Dry = 5;
const kHitachiAc424FanMin = 1;
const kHitachiAc424FanLow = 2;
const kHitachiAc424FanMedium = 3;
const kHitachiAc424FanHigh = 4;
const kHitachiAc424FanAuto = 5;
const kHitachiAc424FanMax = 6;
const kHitachiAc424FanMaxDry = 2;

export const HITACHI_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kHitachiAcMinTemp, max: kHitachiAcMaxTemp },
  swing: true,
  sleep: false,
};

export const HITACHI424_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kHitachiAc424MinTemp, max: kHitachiAc424MaxTemp },
  swing: true,
  sleep: false,
};

const MODE: Record<AcMode, number> = {
  cool: kHitachiAcCool,
  dry: kHitachiAcDry,
  fan: kHitachiAcFan,
  auto: kHitachiAcAuto,
};

/** IRHitachiAc::convertFan. */
function hitachiFan(fan: AcFan): number {
  switch (fan) {
    case 'auto':
      return kHitachiAcFanAuto;
    case 1:
      return kHitachiAcFanLow;
    case 2:
      return kHitachiAcFanLow + 1;
    case 3:
    case 4:
    case 5:
      return kHitachiAcFanHigh - 1;
  }
}

/** IRHitachiAc::calcChecksum. */
export function hitachiChecksum(raw: ArrayLike<number>): number {
  let sum = 62;
  for (let i = 0; i < raw.length - 1; i++) sum = (sum - reverseBits(raw[i] ?? 0, 8)) & 0xff;
  return reverseBits(sum, 8);
}

/** The 28-byte HITACHI_AC state, as IRac::hitachi builds it. */
export function hitachiBytes(s: AcState): number[] {
  const raw = [0x80, 0x08, 0x0c, 0x02, 0xfd, 0x80, 0x7f, 0x88, 0x48, 0x10];
  while (raw.length < kHitachiAcStateLength) raw.push(0);
  raw[14] = 0x60;
  raw[15] = 0x60;
  raw[24] = 0x80;
  setBit(raw, 17, 0, s.power);
  const mode = MODE[s.mode];
  raw[10] = reverseBits(mode, 8);
  // setTemp: fan mode's special 64 is overwritten by IRac's setTemp(degrees) straight after.
  const temp = Math.round(clampSetpoint(s.setpoint, HITACHI_CAPS));
  raw[11] = reverseBits(temp << 1, 8);
  raw[9] = temp === kHitachiAcMinTemp ? 0x90 : 0x10;
  // setFan: only two low speeds in dry, no auto in fan mode.
  let min = kHitachiAcFanAuto;
  let max = kHitachiAcFanHigh;
  if (mode === kHitachiAcDry) {
    min = kHitachiAcFanLow;
    max = kHitachiAcFanLow + 1;
  } else if (mode === kHitachiAcFan) {
    min = kHitachiAcFanLow;
  }
  raw[13] = reverseBits(Math.min(max, Math.max(min, hitachiFan(s.fan))), 8);
  setBit(raw, 14, 7, s.swing);
  setBit(raw, 15, 7, false);
  raw[kHitachiAcStateLength - 1] = hitachiChecksum(raw);
  return raw;
}

/** IRsend::sendHitachiAC for the 28-byte state (MSB first). */
export function hitachiBytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kHitachiAcHdrMark,
    hdrSpace: kHitachiAcHdrSpace,
    oneMark: kHitachiAcBitMark,
    oneSpace: kHitachiAcOneSpace,
    zeroMark: kHitachiAcBitMark,
    zeroSpace: kHitachiAcZeroSpace,
    footerMark: kHitachiAcBitMark,
    gap: kHitachiAcMinGap,
  };
  return new PulseBuilder(kHitachiAcFreq).genericBytes(t, raw, true).signal();
}

const MODE424: Record<Exclude<AcMode, 'auto'>, number> = {
  cool: kHitachiAc424Cool,
  dry: kHitachiAc424Dry,
  fan: kHitachiAc424Fan,
};

/** IRHitachiAc424::convertFan. */
function hitachi424Fan(fan: AcFan): number {
  switch (fan) {
    case 'auto':
      return kHitachiAc424FanAuto;
    case 1:
      return kHitachiAc424FanLow;
    case 2:
      return kHitachiAc424FanMedium;
    case 3:
    case 4:
    case 5:
      return kHitachiAc424FanHigh;
  }
}

/** invertBytePairs from byte 3: every odd byte is the inverse of the one before it. */
function setInvertedStates(raw: number[]): void {
  for (let i = 4; i < raw.length; i += 2) raw[i] = ~(raw[i - 1] ?? 0) & 0xff;
}

/**
 * The 53-byte HITACHI_AC424 state, as IRac::hitachi424 builds it on a fresh object. The button is
 * Power/Mode (setPower runs last), or Swing(V) when the swing must toggle.
 */
export function hitachi424Bytes(s: AcState, swingToggle: boolean): number[] {
  const raw = new Array<number>(kHitachiAc424StateLength).fill(0);
  Object.assign(raw, { 0: 0x01, 1: 0x10, 3: 0x40, 5: 0xff, 7: 0xcc, 27: 0xe1, 33: 0x80 });
  Object.assign(raw, { 35: 0x03, 37: 0x01, 39: 0x88, 45: 0xff, 47: 0xff, 49: 0xff, 51: 0xff });
  // IRHitachiAc424::convertMode sends anything else as cool.
  const mode = s.mode === 'auto' ? kHitachiAc424Cool : MODE424[s.mode];
  setBits(raw, 25, 0, 4, mode);
  setBits(raw, 13, 2, 6, Math.round(clampSetpoint(s.setpoint, HITACHI424_CAPS)));
  // setFan: dry has two low speeds (and auto), fan mode has no auto.
  const want = hitachi424Fan(s.fan);
  let fan = Math.max(want, kHitachiAc424FanMin);
  let max = kHitachiAc424FanMax;
  if (mode === kHitachiAc424Dry && want === kHitachiAc424FanAuto) max = kHitachiAc424FanAuto;
  else if (mode === kHitachiAc424Dry) max = kHitachiAc424FanMaxDry;
  else if (mode === kHitachiAc424Fan && want === kHitachiAc424FanAuto) fan = kHitachiAc424FanMin;
  fan = Math.min(fan, max);
  setBits(raw, 25, 4, 4, fan);
  raw[9] = fan === kHitachiAc424FanMin ? 0x98 : fan === kHitachiAc424FanMax ? 0xa9 : 0x92;
  raw[29] = fan === kHitachiAc424FanMax ? 0x30 : 0x00;
  setBit(raw, 27, 4, s.power);
  raw[11] = swingToggle ? kHitachiAc424ButtonSwingV : kHitachiAc424ButtonPowerMode;
  setInvertedStates(raw);
  return raw;
}

/** IRsend::sendHitachiAc424 (LSB first, with a leader). */
export function hitachi424BytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kHitachiAc424HdrMark,
    hdrSpace: kHitachiAc424HdrSpace,
    oneMark: kHitachiAc424BitMark,
    oneSpace: kHitachiAc424OneSpace,
    zeroMark: kHitachiAc424BitMark,
    zeroSpace: kHitachiAc424ZeroSpace,
    footerMark: kHitachiAc424BitMark,
    gap: kHitachiAcMinGap,
  };
  return new PulseBuilder(kHitachiAcFreq)
    .mark(kHitachiAc424LdrMark)
    .space(kHitachiAc424LdrSpace)
    .genericBytes(t, raw, false)
    .signal();
}

export function hitachiAcSignal(s: AcState): IrSignal {
  return hitachiBytesToSignal(hitachiBytes(s));
}

/** One message; it carries the swing toggle when the swing changed since `prev`. */
export function hitachi424AcSignal(next: AcState, prev?: AcState): IrSignal {
  const toggle = next.swing !== (prev?.swing ?? false);
  return hitachi424BytesToSignal(hitachi424Bytes(next, toggle));
}
