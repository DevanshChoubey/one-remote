/*
 * Midea air conditioner IR encoder (MIDEA, the 48-bit protocol).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Midea.cpp and src/ir_Midea.h, and the IRac::midea
 * mapping and IRac::handleToggles in src/IRac.cpp, Copyright 2017 bwze, crankyoldgit and
 * contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRMideaAC stateReset, calcChecksum,
 *    setPower, setMode, setUseCelsius(true), setTemp (Celsius), setEnableSensorTemp(false),
 *    setType, setFan, setSleep, setSwingVToggle, convertMode, convertFan; and IRsend::sendMidea
 *    (no repeats) with IRMideaAC::send's follow-up swing(V) toggle message.
 *  - The setter sequence IRac runs on a fresh object is folded into one function, giving the same
 *    48-bit value. 48-bit values are plain numbers (exact below 2^53), split into bytes with
 *    arithmetic rather than 32-bit bitwise operators.
 *  - The swing(V) toggle is sent when the swing differs from the last sent state
 *    (IRac::handleToggles); an unknown last state counts as off.
 *  - Heat, Fahrenheit, the sensor temperature (follow me), the timers, quiet, turbo, econo, light,
 *    clean and the 8C heat toggle are left out. The Kaysun and Danby build options are not used.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, reverseBits, type BitTiming } from './irsend';

const kMideaTick = 80;
const kMideaBitMark = 7 * kMideaTick; // 560
const kMideaOneSpace = 21 * kMideaTick; // 1680
const kMideaZeroSpace = 7 * kMideaTick; // 560
const kMideaHdrMark = 56 * kMideaTick; // 4480
const kMideaHdrSpace = 56 * kMideaTick; // 4480
const kMideaMinGap = (56 + 7 + 7) * kMideaTick; // 5600
const kDefaultMessageGap = 100000;
const kMideaBytes = 6;

const kMideaACMinTempC = 17;
const kMideaACMaxTempC = 30;
const kMideaACToggleSwingV = 0xa201ffffff7c;

export const MIDEA_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kMideaACMinTempC, max: kMideaACMaxTempC },
  swing: true,
  sleep: true,
};

/** IRMideaAC::convertMode. */
const MODE: Record<AcMode, number> = { cool: 0, dry: 1, auto: 2, fan: 4 };
/** IRMideaAC::convertFan: low 1, medium 2, high 3, auto 0. */
const FAN: Record<AcFan, number> = { auto: 0, 1: 1, 2: 2, 3: 3, 4: 3, 5: 3 };

/** The six bytes of a value, most significant (byte 5) first, as sendMidea sends them. */
function toBytes(value: number): number[] {
  const out: number[] = [];
  for (let i = kMideaBytes - 1; i >= 0; i--) out.push(Math.floor(value / 2 ** (8 * i)) % 256);
  return out;
}

function fromBytes(bytes: number[]): number {
  return bytes.reduce((v, b) => v * 256 + b, 0);
}

/** IRMideaAC::calcChecksum over bytes 1-5 of the value. */
export function mideaChecksum(value: number): number {
  const b = toBytes(value);
  let sum = 0;
  for (let i = 0; i < kMideaBytes - 1; i++) sum += reverseBits(b[i] ?? 0, 8);
  return reverseBits((256 - (sum & 0xff)) & 0xff, 8);
}

/** The 48-bit state, as IRac::midea builds it on a fresh object (Celsius, no sensor temp). */
export function mideaValue(s: AcState): number {
  const temp = Math.round(clampSetpoint(s.setpoint, MIDEA_CAPS)) - kMideaACMinTempC;
  const bytes = [
    0xa1, // Header 0b10100, Type command
    (s.power ? 0x80 : 0) | (s.sleep ? 0x40 : 0) | (FAN[s.fan] << 3) | MODE[s.mode],
    // Bit 6 is kept from the reset state; bit 5 (Fahrenheit) is clear.
    0x40 | temp,
    0xff, // Beep disabled, off timer off, padding bit
    0xff, // Sensor disabled, sensor temp / on timer off
    0x00, // Sum
  ];
  const value = fromBytes(bytes);
  return value - (value % 256) + mideaChecksum(value);
}

/** IRsend::sendMidea: the message, then the whole message inverted, MSB first. */
export function mideaToSignal(value: number): IrSignal {
  const t: BitTiming = {
    oneMark: kMideaBitMark,
    oneSpace: kMideaOneSpace,
    zeroMark: kMideaBitMark,
    zeroSpace: kMideaZeroSpace,
  };
  const bytes = toBytes(value);
  const b = new PulseBuilder(38000);
  for (const invert of [false, true]) {
    b.mark(kMideaHdrMark).space(kMideaHdrSpace);
    b.bytes(
      t,
      bytes.map((x) => (invert ? x ^ 0xff : x)),
      true,
    );
    b.mark(kMideaBitMark).space(kMideaMinGap);
  }
  return b.space(kDefaultMessageGap).signal();
}

/** IRac::midea: the state, then the swing(V) toggle when the swing differs from the last state. */
export function mideaAcSignal(next: AcState, prev?: AcState): IrSignal[] {
  const frames = [mideaToSignal(mideaValue(next))];
  if (next.swing !== (prev?.swing ?? false)) frames.push(mideaToSignal(kMideaACToggleSwingV));
  return frames;
}
