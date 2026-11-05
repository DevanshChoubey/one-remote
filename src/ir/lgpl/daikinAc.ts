/*
 * Daikin air conditioner IR encoders (DAIKIN, 280 bits, and DAIKIN216).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Daikin.cpp and src/ir_Daikin.h, and the IRac::daikin
 * and IRac::daikin216 mappings in src/IRac.cpp, Copyright 2016 sillyfrog, Copyright 2017 sillyfrog,
 * crankyoldgit, Copyright 2018-2022 crankyoldgit and contributors. The source actually read was
 * master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRDaikinESP and IRDaikin216
 *    stateReset, checksum, setPower, setMode, setTemp, setFan, setSwingVertical,
 *    setSwingHorizontal, convertMode, convertFan, and IRsend::sendDaikin / sendDaikin216 (no
 *    repeats, the full 35-byte DAIKIN form only).
 *  - Heat, quiet, powerful, econo, mould, comfort, sensor, the clock and the timers are left out
 *    (left at their reset values, as IRac sends them when off). Horizontal swing is always off.
 *  - DAIKIN2 and the other Daikin protocols are left out.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBits, sumBytes, type GenericTiming } from './irsend';

export type DaikinProtocol = 'daikin' | 'daikin216';

const kDaikinAuto = 0b000;
const kDaikinDry = 0b010;
const kDaikinCool = 0b011;
const kDaikinFan = 0b110;
const kDaikinMinTemp = 10;
const kDaikinMaxTemp = 32;
const kDaikinFanMin = 1;
const kDaikinFanMed = 3;
const kDaikinFanMax = 5;
const kDaikinFanAuto = 0b1010;
const kDaikinSwingOn = 0b1111;
const kDaikinSwingOff = 0b0000;

const kDaikinStateLength = 35;
const kDaikinSection1Length = 8;
const kDaikinSection2Length = 8;
const kDaikinHeaderLength = 5;
const kDaikinHdrMark = 3650;
const kDaikinHdrSpace = 1623;
const kDaikinBitMark = 428;
const kDaikinZeroSpace = 428;
const kDaikinOneSpace = 1280;
const kDaikinGap = 29000;

const kDaikin216StateLength = 27;
const kDaikin216Section1Length = 8;
const kDaikin216HdrMark = 3440;
const kDaikin216HdrSpace = 1750;
const kDaikin216BitMark = 420;
const kDaikin216OneSpace = 1300;
const kDaikin216ZeroSpace = 450;
const kDaikin216Gap = 29650;

export const DAIKIN_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kDaikinMinTemp, max: kDaikinMaxTemp },
  swing: true,
  sleep: false,
};

const MODE: Record<AcMode, number> = {
  cool: kDaikinCool,
  dry: kDaikinDry,
  fan: kDaikinFan,
  auto: kDaikinAuto,
};

/** IRDaikinESP::convertFan (low, medium, high), then setFan's 2 + speed storage. */
function fanBits(fan: AcFan): number {
  switch (fan) {
    case 'auto':
      return kDaikinFanAuto;
    case 1:
      return 2 + kDaikinFanMin;
    case 2:
      return 2 + kDaikinFanMed;
    case 3:
      return 2 + (kDaikinFanMax - 1);
  }
}

/** IRDaikinESP::checksum: each section's last byte is the sum of the bytes before it. */
export function daikinChecksum(raw: number[]): void {
  const s2 = kDaikinSection1Length;
  const s3 = s2 + kDaikinSection2Length;
  raw[s2 - 1] = sumBytes(raw, 0, s2 - 1);
  raw[s3 - 1] = sumBytes(raw, s2, s3 - 1);
  raw[kDaikinStateLength - 1] = sumBytes(raw, s3, kDaikinStateLength - 1);
}

/** The 35-byte DAIKIN state, as IRac::daikin builds it. */
export function daikinBytes(s: AcState): number[] {
  const raw = new Array<number>(kDaikinStateLength).fill(0);
  Object.assign(raw, { 0: 0x11, 1: 0xda, 2: 0x27, 4: 0xc5, 8: 0x11, 9: 0xda, 10: 0x27, 12: 0x42 });
  Object.assign(raw, { 16: 0x11, 17: 0xda, 18: 0x27, 21: 0x49, 22: 0x1e, 24: 0xb0 });
  Object.assign(raw, { 27: 0x06, 28: 0x60, 31: 0xc0 });
  setBits(raw, 21, 0, 1, s.power ? 1 : 0);
  setBits(raw, 21, 4, 3, MODE[s.mode]);
  raw[22] = clampSetpoint(s.setpoint, DAIKIN_CAPS) * 2;
  setBits(raw, 24, 4, 4, fanBits(s.fan));
  setBits(raw, 24, 0, 4, s.swing ? kDaikinSwingOn : kDaikinSwingOff);
  setBits(raw, 25, 0, 4, kDaikinSwingOff);
  daikinChecksum(raw);
  return raw;
}

/** IRsend::sendDaikin for the full 35-byte state. */
export function daikinBytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kDaikinHdrMark,
    hdrSpace: kDaikinHdrSpace,
    oneMark: kDaikinBitMark,
    oneSpace: kDaikinOneSpace,
    zeroMark: kDaikinBitMark,
    zeroSpace: kDaikinZeroSpace,
    footerMark: kDaikinBitMark,
    gap: kDaikinZeroSpace + kDaikinGap,
  };
  const b = new PulseBuilder(38000);
  // The 0b00000 preamble has no header.
  b.startMessage().data(t, 0, kDaikinHeaderLength, false).footer(t);
  const s2 = kDaikinSection1Length;
  const s3 = s2 + kDaikinSection2Length;
  const all = Array.from(raw);
  b.genericBytes(t, all.slice(0, s2), false);
  b.genericBytes(t, all.slice(s2, s3), false);
  b.genericBytes(t, all.slice(s3), false);
  return b.signal();
}

/** The 27-byte DAIKIN216 state, as IRac::daikin216 builds it. */
export function daikin216Bytes(s: AcState): number[] {
  const raw = new Array<number>(kDaikin216StateLength).fill(0);
  Object.assign(raw, { 0: 0x11, 1: 0xda, 2: 0x27, 3: 0xf0, 8: 0x11, 9: 0xda, 10: 0x27, 23: 0xc0 });
  setBits(raw, 13, 0, 1, s.power ? 1 : 0);
  setBits(raw, 13, 4, 3, MODE[s.mode]);
  setBits(raw, 14, 1, 6, Math.round(clampSetpoint(s.setpoint, DAIKIN_CAPS)));
  setBits(raw, 16, 4, 4, fanBits(s.fan));
  setBits(raw, 16, 0, 4, s.swing ? kDaikinSwingOn : kDaikinSwingOff);
  setBits(raw, 17, 0, 4, kDaikinSwingOff);
  raw[kDaikin216Section1Length - 1] = sumBytes(raw, 0, kDaikin216Section1Length - 1);
  raw[kDaikin216StateLength - 1] = sumBytes(
    raw,
    kDaikin216Section1Length,
    kDaikin216StateLength - 1,
  );
  return raw;
}

/** IRsend::sendDaikin216. */
export function daikin216BytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kDaikin216HdrMark,
    hdrSpace: kDaikin216HdrSpace,
    oneMark: kDaikin216BitMark,
    oneSpace: kDaikin216OneSpace,
    zeroMark: kDaikin216BitMark,
    zeroSpace: kDaikin216ZeroSpace,
    footerMark: kDaikin216BitMark,
    gap: kDaikin216Gap,
  };
  const all = Array.from(raw);
  return new PulseBuilder(38000)
    .genericBytes(t, all.slice(0, kDaikin216Section1Length), false)
    .genericBytes(t, all.slice(kDaikin216Section1Length), false)
    .signal();
}

/** The whole state goes in one message each press, so `prev` is not needed. */
export function daikinAcSignal(s: AcState, protocol: DaikinProtocol): IrSignal {
  return protocol === 'daikin'
    ? daikinBytesToSignal(daikinBytes(s))
    : daikin216BytesToSignal(daikin216Bytes(s));
}
