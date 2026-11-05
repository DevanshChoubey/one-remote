/*
 * Voltas air conditioner IR encoder (VOLTAS, the 122LZF remote).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Voltas.cpp and src/ir_Voltas.h, and the IRac::voltas
 * mapping in src/IRac.cpp, Copyright 2020 David Conran (crankyoldgit), Copyright 2020 manj9501
 * and contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0,
 * 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRVoltas stateReset, calcChecksum,
 *    setModel(122LZF), setPower, setMode, setTemp, setFan, setSwingV, setTurbo(false),
 *    setEcono(false), setLight(false), setSleep, convertMode, convertFan; and IRsend::sendVoltas
 *    (no repeats).
 *  - The setter sequence IRac runs on a fresh object is folded into one function, giving the same
 *    bytes. The protocol has no auto mode; IRVoltas::convertMode sends auto as cool, so auto is not
 *    offered.
 *  - Heat, turbo, econo, WiFi, the light and the timers are left out. Horizontal swing is not
 *    available on the 122LZF.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBit, setBits, sumBytes, type GenericTiming } from './irsend';

const kVoltasBitMark = 1026;
const kVoltasOneSpace = 2553;
const kVoltasZeroSpace = 554;
const kVoltasFreq = 38000;
const kDefaultMessageGap = 100000;
const kVoltasStateLength = 10;

const kVoltasFan = 0b0001;
const kVoltasDry = 0b0100;
const kVoltasCool = 0b1000;
const kVoltasMinTemp = 16;
const kVoltasMaxTemp = 30;
const kVoltasFanHigh = 0b001;
const kVoltasFanMed = 0b010;
const kVoltasFanLow = 0b100;
const kVoltasFanAuto = 0b111;
const kVoltasSwingHNoChange = 0b0011001;

export const VOLTAS_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kVoltasMinTemp, max: kVoltasMaxTemp },
  swing: true,
  sleep: true,
};

/** IRVoltas::convertMode: auto has no code and is sent as cool. */
const MODE: Record<AcMode, number> = {
  cool: kVoltasCool,
  dry: kVoltasDry,
  fan: kVoltasFan,
  auto: kVoltasCool,
};
/** IRVoltas::convertFan: low 4, medium 2, high 1, auto 7. */
const FAN: Record<AcFan, number> = {
  auto: kVoltasFanAuto,
  1: kVoltasFanLow,
  2: kVoltasFanMed,
  3: kVoltasFanHigh,
  4: kVoltasFanHigh,
  5: kVoltasFanHigh,
};

/** IRVoltas::calcChecksum: the inverted sum of bytes 0-8. */
export function voltasChecksum(raw: ArrayLike<number>): number {
  return ~sumBytes(raw, 0, kVoltasStateLength - 1) & 0xff;
}

/** The 10-byte state, as IRac::voltas builds it on a fresh object for the 122LZF. */
export function voltasBytes(s: AcState): number[] {
  // stateReset (Cool, 23C, fan High, power off, timers off).
  const raw = [0x33, 0x28, 0x00, 0x17, 0x3b, 0x3b, 0x3b, 0x11, 0x00, 0x00];
  // setModel(122LZF): setSwingHChange(false), which also sets SwingH.
  setBits(raw, 0, 1, 7, kVoltasSwingHNoChange);
  setBit(raw, 0, 0, true);
  setBit(raw, 2, 7, s.power); // Power
  const mode = MODE[s.mode];
  setBits(raw, 1, 0, 4, mode); // Mode (setMode's dry fan and temp are overwritten below)
  setBits(raw, 3, 0, 4, Math.round(clampSetpoint(s.setpoint, VOLTAS_CAPS)) - kVoltasMinTemp);
  // setFan: auto speed is not available in fan mode, which takes high.
  const fan = FAN[s.fan] === kVoltasFanAuto && mode === kVoltasFan ? kVoltasFanHigh : FAN[s.fan];
  setBits(raw, 1, 5, 3, fan);
  setBits(raw, 2, 0, 3, s.swing ? 0b111 : 0b000); // SwingV
  setBit(raw, 2, 5, false); // Turbo
  setBit(raw, 3, 6, false); // Econo
  setBit(raw, 8, 5, false); // Light
  setBit(raw, 2, 6, s.sleep && mode === kVoltasCool); // Sleep (cool only)
  raw[kVoltasStateLength - 1] = voltasChecksum(raw);
  return raw;
}

/** IRsend::sendVoltas: no header, MSB first, a footer mark and the default gap. */
export function voltasBytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: 0,
    hdrSpace: 0,
    oneMark: kVoltasBitMark,
    oneSpace: kVoltasOneSpace,
    zeroMark: kVoltasBitMark,
    zeroSpace: kVoltasZeroSpace,
    footerMark: kVoltasBitMark,
    gap: kDefaultMessageGap,
  };
  return new PulseBuilder(kVoltasFreq).startMessage().bytes(t, raw, true).footer(t).signal();
}

export function voltasAcSignal(s: AcState): IrSignal {
  return voltasBytesToSignal(voltasBytes(s));
}
