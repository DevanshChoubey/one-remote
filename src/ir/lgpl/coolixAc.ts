/*
 * Coolix air conditioner IR encoder (COOLIX: Midea-made units sold under many brands).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Coolix.cpp and src/ir_Coolix.h, and the IRac::coolix
 * mapping and IRac::handleToggles in src/IRac.cpp, Copyright bakrus, Copyright 2017, 2019 David
 * Conran and contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0,
 * 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRCoolixAC stateReset, setPower, setTemp
 *    (Celsius), setMode, setFan, clearSensorTemp, setZoneFollow(false), setSwing, setSleep,
 *    convertMode, convertFan; and IRsend::sendCOOLIX with IRCoolixAC::send's single repeat.
 *  - The setter sequence IRac runs on a fresh object is folded into one function, giving the same
 *    24-bit value.
 *  - Swing and sleep are toggle commands sent after the state, as IRac::coolix does. Whether each
 *    must be sent is worked out from the last sent state (IRac::handleToggles); an unknown last
 *    state counts as off.
 *  - Heat, Fahrenheit (COOLIX48), the sensor temperature, turbo, light, clean and the swing step are
 *    left out.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, type BitTiming } from './irsend';

const kCoolixTick = 276;
const kCoolixBitMark = 2 * kCoolixTick; // 552
const kCoolixOneSpace = 6 * kCoolixTick; // 1656
const kCoolixZeroSpace = 2 * kCoolixTick; // 552
const kCoolixHdrMark = 17 * kCoolixTick; // 4692
const kCoolixHdrSpace = 16 * kCoolixTick; // 4416
const kCoolixMinGap = (17 + 2) * kCoolixTick; // 5244
const kDefaultMessageGap = 100000;
const kCoolixBits = 24;
const kCoolixDefaultRepeat = 1;

const kCoolixCool = 0b000;
const kCoolixDry = 0b001;
const kCoolixAuto = 0b010;
const kCoolixFanMin = 0b100;
const kCoolixFanMed = 0b010;
const kCoolixFanMax = 0b001;
const kCoolixFanAuto = 0b101;
const kCoolixFanAuto0 = 0b000;
const kCoolixTempMin = 17;
const kCoolixTempMax = 30;
const kCoolixFanTempCode = 0b1110;
const kCoolixTempMap = [
  0b0000, 0b0001, 0b0011, 0b0010, 0b0110, 0b0111, 0b0101, 0b0100, 0b1100, 0b1101, 0b1001, 0b1000,
  0b1010, 0b1011,
];
const kCoolixSensorTempIgnoreCode = 0b11111;
/** The fixed top byte (bits 16-23) of kCoolixDefaultState 0xB21FC8, zone follow off. */
const kCoolixPrefix = 0xb2;

export const kCoolixOff = 0xb27be0;
export const kCoolixSwing = 0xb26be0;
export const kCoolixSleep = 0xb2e003;

export const COOLIX_CAPS: Capabilities = {
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kCoolixTempMin, max: kCoolixTempMax },
  swing: true,
  sleep: true,
};

/** IRCoolixAC::convertFan: low = Min, medium = Med, high = Max. */
const FAN: Record<AcFan, number> = {
  auto: kCoolixFanAuto,
  1: kCoolixFanMin,
  2: kCoolixFanMed,
  3: kCoolixFanMax,
  4: kCoolixFanMax,
  5: kCoolixFanMax,
};

/** The 24-bit state, as IRac::coolix builds it on a fresh object (power on). */
export function coolixValue(s: AcState): number {
  const temp = Math.round(clampSetpoint(s.setpoint, COOLIX_CAPS));
  let tempCode = kCoolixTempMap[temp - kCoolixTempMin] ?? 0;
  let mode: number;
  switch (s.mode) {
    case 'cool':
      mode = kCoolixCool;
      break;
    case 'dry':
      mode = kCoolixDry;
      break;
    case 'auto':
      mode = kCoolixAuto;
      break;
    case 'fan':
      // Fan only is Dry with a special temperature code.
      mode = kCoolixDry;
      tempCode = kCoolixFanTempCode;
      break;
  }
  let fan = FAN[s.fan];
  // setFan's mode check: Dry and Auto cannot have FanAuto, only FanAuto0.
  if (fan === kCoolixFanAuto && (s.mode === 'auto' || s.mode === 'dry')) fan = kCoolixFanAuto0;
  // Bits: 1 zone follow (off), 2-3 mode, 4-7 temp, 8-12 sensor temp, 13-15 fan, 16-23 prefix.
  return (
    ((kCoolixPrefix << 16) |
      (fan << 13) |
      (kCoolixSensorTempIgnoreCode << 8) |
      (tempCode << 4) |
      (mode << 2)) >>>
    0
  );
}

/** IRsend::sendCOOLIX with one repeat: each byte is followed by its inverse, MSB first. */
export function coolixToSignal(value: number): IrSignal {
  const t: BitTiming = {
    oneMark: kCoolixBitMark,
    oneSpace: kCoolixOneSpace,
    zeroMark: kCoolixBitMark,
    zeroSpace: kCoolixZeroSpace,
  };
  const b = new PulseBuilder(38000);
  for (let r = 0; r <= kCoolixDefaultRepeat; r++) {
    b.mark(kCoolixHdrMark).space(kCoolixHdrSpace);
    for (let i = 8; i <= kCoolixBits; i += 8) {
      const segment = (value >>> (kCoolixBits - i)) & 0xff;
      b.data(t, segment, 8, true).data(t, segment ^ 0xff, 8, true);
    }
    b.mark(kCoolixBitMark).space(kCoolixMinGap);
  }
  return b.space(kDefaultMessageGap).signal();
}

/**
 * IRac::coolix: off is one message; on is the state, then the swing and sleep toggles when they
 * differ from the last sent state.
 */
export function coolixAcSignal(next: AcState, prev?: AcState): IrSignal[] {
  if (!next.power) return [coolixToSignal(kCoolixOff)];
  const frames = [coolixToSignal(coolixValue(next))];
  if (next.swing !== (prev?.swing ?? false)) frames.push(coolixToSignal(kCoolixSwing));
  if (next.sleep !== (prev?.sleep ?? false)) frames.push(coolixToSignal(kCoolixSleep));
  return frames;
}
