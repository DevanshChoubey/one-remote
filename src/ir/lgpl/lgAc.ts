/*
 * LG air conditioner IR encoder (LG 28-bit and LG2).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_LG.cpp and src/ir_LG.h, and the IRac::lg mapping in
 * src/IRac.cpp, Copyright 2015 Darryl Smith, Copyright 2015 cheaplin, Copyright 2017-2021 David
 * Conran and contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0,
 * 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRLgAc::stateReset, setModel, setPower,
 *    setMode, setTemp, setFan, setSwingV, calcChecksum, send, and IRsend::sendLG / sendLG2 for the
 *    28-bit messages (the 32-bit Samsung-like form and repeats are left out).
 *  - Models kept: AKB74955603 (LG2, vertical swing as absolute codes), AKB75215403 (LG2, no swing
 *    message) and LG6711A20083V (LG, vertical swing as a toggle). AKB73757604 (per-vane swing) and
 *    GE6711AR2853M are left out.
 *  - Heat, the per-vane swing, horizontal swing and the light are left out. The light stays on, so
 *    the AKB74955603 light toggle is never sent.
 *  - Upstream sends the main message and the swing message back to back in one send(); here they
 *    are separate frames so the driver can tell which went out. The previous swing comes from
 *    `prev` (unknown is taken as off, as IRac::sendAc does without a previous state).
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder } from './irsend';

export type LgModel = 'akb74955603' | 'akb75215403' | 'lg6711a20083v';

const kLgBitMark = 550;
const kLgOneSpace = 1600;
const kLgZeroSpace = 550;
const kLgMinGap = 39750;
const kLgMinMessageLength = 108050;
const kLgHdrMark = 8500;
const kLgHdrSpace = 4250;
const kLg2HdrMark = 3200;
const kLg2HdrSpace = 9900;
const kLg2BitMark = 480;
const kLgBits = 28;

const kLgAcFanLow = 1;
const kLgAcFanMedium = 2;
const kLgAcFanMax = 4;
const kLgAcFanAuto = 5;
const kLgAcFanLowAlt = 9;
const kLgAcFanHigh = 10;
const kLgAcTempAdjust = 15;
const kLgAcCool = 0;
const kLgAcDry = 1;
const kLgAcFan = 2;
const kLgAcAuto = 3;
const kLgAcPowerOn = 0;
const kLgAcSignature = 0x88;

export const kLgAcOffCommand = 0x88c0051;
export const kLgAcSwingVToggle = 0x8810001;
export const kLgAcSwingVSwing = 0x8813149;
export const kLgAcSwingVOff = 0x881315a;

const MODE: Record<AcMode, number> = {
  cool: kLgAcCool,
  dry: kLgAcDry,
  fan: kLgAcFan,
  auto: kLgAcAuto,
};

// IRLgAc::convertFan from the common low / medium / high, then setFan's model rules.
function fanCode(fan: AcFan, model: LgModel): number {
  switch (fan) {
    case 'auto':
      return kLgAcFanAuto;
    case 1:
      return model === 'akb74955603' ? kLgAcFanLowAlt : kLgAcFanLow;
    case 2:
      return kLgAcFanMedium;
    case 3:
      return model === 'akb74955603' ? kLgAcFanHigh : kLgAcFanMax;
  }
}

export const LG_CAPS: Record<LgModel, Capabilities> = {
  akb74955603: {
    acModes: ['cool', 'dry', 'fan', 'auto'],
    acFan: ['auto', 1, 2, 3],
    setpoint: { min: 16, max: 30 },
    swing: true,
    sleep: false,
  },
  akb75215403: {
    acModes: ['cool', 'dry', 'fan', 'auto'],
    acFan: ['auto', 1, 2, 3],
    setpoint: { min: 16, max: 30 },
    swing: false,
    sleep: false,
  },
  lg6711a20083v: {
    acModes: ['cool', 'dry', 'fan', 'auto'],
    acFan: ['auto', 1, 2, 3],
    setpoint: { min: 16, max: 30 },
    swing: true,
    sleep: false,
  },
};

/** IRLgAc::calcChecksum: the sum of the four nibbles above the checksum nibble. */
export function lgChecksum(code: number): number {
  let sum = 0;
  for (let i = 1; i <= 4; i++) sum += (code >>> (4 * i)) & 0xf;
  return sum & 0xf;
}

/** The 28-bit state message for a powered-on AC (IRLgAc::getRaw). */
export function lgStateCode(s: AcState, model: LgModel): number {
  const temp = clampSetpoint(Math.round(s.setpoint), LG_CAPS[model]) - kLgAcTempAdjust;
  const raw =
    ((kLgAcSignature << 20) |
      (kLgAcPowerOn << 18) |
      (MODE[s.mode] << 12) |
      (temp << 8) |
      (fanCode(s.fan, model) << 4)) >>>
    0;
  return (raw | lgChecksum(raw)) >>> 0;
}

/**
 * The 28-bit messages IRac::lg sends, in order: the power off command alone, or the state, then
 * the swing message when the swing changed.
 */
export function lgAcCodes(next: AcState, prev: AcState | undefined, model: LgModel): number[] {
  if (!next.power) return [kLgAcOffCommand];
  const codes = [lgStateCode(next, model)];
  const swingChanged = next.swing !== (prev?.swing ?? false);
  if (swingChanged && model === 'akb74955603') {
    codes.push(next.swing ? kLgAcSwingVSwing : kLgAcSwingVOff);
  } else if (swingChanged && model === 'lg6711a20083v') {
    codes.push(kLgAcSwingVToggle);
  }
  return codes;
}

/** IRsend::sendLG (28-bit, no repeat). */
export function lgSignal(code: number): IrSignal {
  const t = {
    hdrMark: kLgHdrMark,
    hdrSpace: kLgHdrSpace,
    oneMark: kLgBitMark,
    oneSpace: kLgOneSpace,
    zeroMark: kLgBitMark,
    zeroSpace: kLgZeroSpace,
    footerMark: kLgBitMark,
    gap: kLgMinGap,
  };
  return new PulseBuilder(38000).genericBits(t, code, kLgBits, true, kLgMinMessageLength).signal();
}

/** IRsend::sendLG2 (28-bit, no repeat). */
export function lg2Signal(code: number): IrSignal {
  const t = {
    hdrMark: kLg2HdrMark,
    hdrSpace: kLg2HdrSpace,
    oneMark: kLg2BitMark,
    oneSpace: kLgOneSpace,
    zeroMark: kLg2BitMark,
    zeroSpace: kLgZeroSpace,
    footerMark: kLg2BitMark,
    gap: kLgMinGap,
  };
  return new PulseBuilder(38000).genericBits(t, code, kLgBits, true, kLgMinMessageLength).signal();
}

export function lgAcFrames(next: AcState, prev: AcState | undefined, model: LgModel): IrSignal[] {
  const send = model === 'lg6711a20083v' ? lgSignal : lg2Signal;
  return lgAcCodes(next, prev, model).map(send);
}
