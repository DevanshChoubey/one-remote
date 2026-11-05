/*
 * Haier air conditioner IR encoders (HAIER_AC, HAIER_AC_YRW02 and HAIER_AC176).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Haier.cpp and src/ir_Haier.h, and the IRac::haier,
 * IRac::haierYrwo2 and IRac::haier176 mappings in src/IRac.cpp, Copyright 2018-2021 crankyoldgit
 * and contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0,
 * 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRHaierAC stateReset, checksum,
 *    setCommand, setFan, setMode, setTemp, setHealth, setSleep, setSwingV, convertMode,
 *    convertFan, convertSwingV; IRHaierAC176 stateReset, checksum, setModel, setMode,
 *    setUseFahrenheit(false), setTemp (Celsius), setFan, setSwingV, setSwingH, setQuiet(false),
 *    setTurbo(false), setHealth, setSleep, setPower, convertMode, convertFan, convertSwingV; and
 *    IRsend::sendHaierAC / sendHaierACYRW02 / sendHaierAC176 (no repeats).
 *  - The setter sequence IRac runs on a fresh object is folded into one function each, giving the
 *    same bytes: HAIER_AC ends with the On or Off command, the others with the Power button.
 *  - Heat, Fahrenheit, turbo, quiet, the timers and the clock are left out. Health (the filter) is
 *    off and horizontal swing is the middle position, as IRac sends them by default.
 *  - HAIER_AC160 is left out.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBit, setBits, sumBytes, type GenericTiming } from './irsend';

export type Haier176Model = 'yrw02' | 'v9014557a';

const kHaierAcHdr = 3000;
const kHaierAcHdrGap = 4300;
const kHaierAcBitMark = 520;
const kHaierAcOneSpace = 1650;
const kHaierAcZeroSpace = 650;
const kHaierAcMinGap = 150000;

const kHaierACStateLength = 9;
const kHaierAcPrefix = 0b10100101;
const kHaierAcMinTemp = 16;
const kHaierAcMaxTemp = 30;
const kHaierAcCmdOff = 0b0000;
const kHaierAcCmdOn = 0b0001;
const kHaierAcSwingVOff = 0b00;
const kHaierAcSwingVChg = 0b11;

const kHaierACYRW02StateLength = 14;
const kHaierAC176StateLength = 22;
const kHaierAcYrw02MinTempC = 16;
const kHaierAcYrw02MaxTempC = 30;
const kHaierAcYrw02ModelA = 0xa6;
const kHaierAc176Prefix = 0xb7;
const kHaierAcYrw02SwingVOff = 0x0;
const kHaierAcYrw02SwingVAuto = 0xc;
const kHaierAcYrw02SwingHMiddle = 0x0;
const kHaierAcYrw02FanHigh = 0b001;
const kHaierAcYrw02FanMed = 0b010;
const kHaierAcYrw02FanLow = 0b011;
const kHaierAcYrw02FanAuto = 0b101;
const kHaierAcYrw02ButtonPower = 0b00101;

const caps = (min: number, max: number): Capabilities => ({
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min, max },
  swing: true,
  sleep: true,
});

export const HAIER_CAPS = caps(kHaierAcMinTemp, kHaierAcMaxTemp);
export const HAIER176_CAPS = caps(kHaierAcYrw02MinTempC, kHaierAcYrw02MaxTempC);

/** IRHaierAC modes (kHaierAcAuto ... kHaierAcFan). */
const MODE: Record<AcMode, number> = { auto: 0, cool: 1, dry: 2, fan: 4 };

/** IRHaierAC::convertFan, then setFan's stored value (low 3, medium 2, high 1, auto 0). */
function haierFanBits(fan: AcFan): number {
  switch (fan) {
    case 'auto':
      return 0;
    case 1:
      return 3;
    case 2:
      return 2;
    case 3:
      return 1;
  }
}

/** The 9-byte HAIER_AC state, as IRac::haier builds it. */
export function haierBytes(s: AcState): number[] {
  const raw = new Array<number>(kHaierACStateLength).fill(0);
  raw[0] = kHaierAcPrefix;
  setBit(raw, 2, 5, true); // unknown, always 1
  setBits(raw, 4, 0, 5, 12); // OffHours, the default initial state
  setBits(raw, 6, 5, 3, MODE[s.mode]); // Mode
  const temp = Math.round(clampSetpoint(s.setpoint, HAIER_CAPS));
  setBits(raw, 1, 4, 4, temp - kHaierAcMinTemp); // Temp
  setBits(raw, 5, 6, 2, haierFanBits(s.fan)); // Fan
  setBits(raw, 2, 6, 2, s.swing ? kHaierAcSwingVChg : kHaierAcSwingVOff); // SwingV
  setBit(raw, 4, 5, false); // Health
  setBit(raw, 7, 6, s.sleep); // Sleep
  setBits(raw, 1, 0, 4, s.power ? kHaierAcCmdOn : kHaierAcCmdOff); // Command
  raw[kHaierACStateLength - 1] = sumBytes(raw, 0, kHaierACStateLength - 1);
  return raw;
}

/** IRHaierAC176 modes (kHaierAcYrw02Auto ... kHaierAcYrw02Fan). */
const MODE176: Record<AcMode, number> = { auto: 0b000, cool: 0b001, dry: 0b010, fan: 0b110 };

/** IRHaierAC176::convertFan. */
function haier176Fan(fan: AcFan): number {
  switch (fan) {
    case 'auto':
      return kHaierAcYrw02FanAuto;
    case 1:
      return kHaierAcYrw02FanLow;
    case 2:
      return kHaierAcYrw02FanMed;
    case 3:
      return kHaierAcYrw02FanHigh;
  }
}

/**
 * The 22-byte HAIER_AC176 state, as IRac::haier176 / IRac::haierYrwo2 build it. HAIER_AC_YRW02
 * sends the first 14 bytes of it.
 */
export function haier176Bytes(s: AcState): number[] {
  const raw = new Array<number>(kHaierAC176StateLength).fill(0);
  raw[0] = kHaierAcYrw02ModelA; // Model (V9014557-A; YR-W02 uses the same)
  raw[14] = kHaierAc176Prefix; // Prefix2
  setBits(raw, 7, 5, 3, MODE176[s.mode]); // Mode
  setBit(raw, 10, 5, false); // UseFahrenheit
  const temp = Math.round(clampSetpoint(s.setpoint, HAIER176_CAPS));
  setBits(raw, 1, 4, 4, temp - kHaierAcYrw02MinTempC); // Temp
  const fan = haier176Fan(s.fan);
  setBits(raw, 5, 5, 3, fan); // Fan
  setBits(raw, 16, 6, 2, fan === kHaierAcYrw02FanAuto ? 0 : fan); // Fan2
  setBits(raw, 1, 0, 4, s.swing ? kHaierAcYrw02SwingVAuto : kHaierAcYrw02SwingVOff); // SwingV
  setBits(raw, 2, 5, 3, kHaierAcYrw02SwingHMiddle); // SwingH
  setBit(raw, 3, 1, false); // Health
  setBit(raw, 8, 7, s.sleep); // Sleep
  setBit(raw, 4, 6, s.power); // Power
  setBits(raw, 12, 0, 5, kHaierAcYrw02ButtonPower); // Button
  raw[kHaierACYRW02StateLength - 1] = sumBytes(raw, 0, kHaierACYRW02StateLength - 1);
  raw[kHaierAC176StateLength - 1] = sumBytes(
    raw,
    kHaierACYRW02StateLength,
    kHaierAC176StateLength - 1,
  );
  return raw;
}

/** IRsend::sendHaierAC (MSB first, a 3000/3000 pre-header, then the header). */
export function haierBytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kHaierAcHdr,
    hdrSpace: kHaierAcHdrGap,
    oneMark: kHaierAcBitMark,
    oneSpace: kHaierAcOneSpace,
    zeroMark: kHaierAcBitMark,
    zeroSpace: kHaierAcZeroSpace,
    footerMark: kHaierAcBitMark,
    gap: kHaierAcMinGap,
  };
  return new PulseBuilder(38000)
    .mark(kHaierAcHdr)
    .space(kHaierAcHdr)
    .genericBytes(t, raw, true)
    .signal();
}

export function haierAcSignal(s: AcState): IrSignal {
  return haierBytesToSignal(haierBytes(s));
}

/** YR-W02 sends the 14-byte form, V9014557 the full 22 bytes. */
export function haier176AcSignal(s: AcState, model: Haier176Model): IrSignal {
  const raw = haier176Bytes(s);
  return haierBytesToSignal(model === 'yrw02' ? raw.slice(0, kHaierACYRW02StateLength) : raw);
}
