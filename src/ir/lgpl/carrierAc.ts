/*
 * Carrier air conditioner IR encoder (CARRIER_AC64).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Carrier.cpp and src/ir_Carrier.h, and the
 * IRac::carrier64 mapping in src/IRac.cpp, Copyright 2018-2022 David Conran and contributors. The
 * source actually read was master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRCarrierAc64 stateReset,
 *    calcChecksum, setPower, setMode, setTemp, setFan, setSwingV, setSleep, convertMode,
 *    convertFan, and IRsend::sendCarrierAC64 (no repeats). The 64-bit value is kept as eight bytes,
 *    least significant first, which sends the same bits in the same order.
 *  - Heat and the on / off timers are left out. The protocol has no dry or auto mode; both are
 *    sent as cool, as IRCarrierAc64::convertMode does, and only cool and fan are offered.
 *  - CARRIER_AC (32-bit), CARRIER_AC40, CARRIER_AC84 and CARRIER_AC128 are left out.
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBit, setBits, type GenericTiming } from './irsend';

const kCarrierAc64HdrMark = 8940;
const kCarrierAc64HdrSpace = 4556;
const kCarrierAc64BitMark = 503;
const kCarrierAc64OneSpace = 1736;
const kCarrierAc64ZeroSpace = 615;
const kCarrierAc64Gap = 100000; // kDefaultMessageGap

const kCarrierAc64Cool = 0b10;
const kCarrierAc64Fan = 0b11;
const kCarrierAc64FanAuto = 0b00;
const kCarrierAc64FanLow = 0b01;
const kCarrierAc64FanMedium = 0b10;
const kCarrierAc64FanHigh = 0b11;
const kCarrierAc64MinTemp = 16;
const kCarrierAc64MaxTemp = 30;

export const CARRIER64_CAPS: Capabilities = {
  acModes: ['cool', 'fan'],
  acFan: ['auto', 1, 2, 3],
  setpoint: { min: kCarrierAc64MinTemp, max: kCarrierAc64MaxTemp },
  swing: true,
  sleep: true,
};

/** IRCarrierAc64::convertFan. */
function fanBits(fan: AcFan): number {
  switch (fan) {
    case 'auto':
      return kCarrierAc64FanAuto;
    case 1:
      return kCarrierAc64FanLow;
    case 2:
      return kCarrierAc64FanMedium;
    case 3:
      return kCarrierAc64FanHigh;
  }
}

/** The 64-bit value as eight bytes, least significant first. */
export function carrier64ValueBytes(value: bigint): number[] {
  return Array.from({ length: 8 }, (_, i) => Number((value >> BigInt(8 * i)) & 0xffn));
}

/** IRCarrierAc64::calcChecksum: the sum of the nibbles above the checksum (bits 20 to 63). */
export function carrier64Checksum(b: ArrayLike<number>): number {
  let sum = ((b[2] ?? 0) >> 4) & 0xf;
  for (let i = 3; i < 8; i++) sum += ((b[i] ?? 0) & 0xf) + (((b[i] ?? 0) >> 4) & 0xf);
  return sum & 0xf;
}

/** The CARRIER_AC64 state as eight bytes, as IRac::carrier64 builds it. */
export function carrier64Bytes(s: AcState): number[] {
  const b = carrier64ValueBytes(0x109000002c2a5584n);
  setBit(b, 4, 4, s.power); // Power
  setBits(b, 2, 4, 2, s.mode === 'fan' ? kCarrierAc64Fan : kCarrierAc64Cool); // Mode
  const temp = Math.round(clampSetpoint(s.setpoint, CARRIER64_CAPS));
  setBits(b, 3, 0, 4, temp - kCarrierAc64MinTemp); // Temp
  setBits(b, 2, 6, 2, fanBits(s.fan)); // Fan
  setBit(b, 3, 5, s.swing); // SwingV
  if (s.sleep) {
    // setSleep(true): a 2 hour off timer, both timer enables cleared.
    setBits(b, 7, 4, 4, 2); // OffTimer
    setBit(b, 4, 6, false); // OnTimerEnable
    setBit(b, 4, 5, false); // OffTimerEnable
  }
  setBit(b, 4, 7, s.sleep); // Sleep
  setBits(b, 2, 0, 4, carrier64Checksum(b)); // Sum
  return b;
}

/** IRsend::sendCarrierAC64 (64 bits, LSB first). */
export function carrier64BytesToSignal(b: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kCarrierAc64HdrMark,
    hdrSpace: kCarrierAc64HdrSpace,
    oneMark: kCarrierAc64BitMark,
    oneSpace: kCarrierAc64OneSpace,
    zeroMark: kCarrierAc64BitMark,
    zeroSpace: kCarrierAc64ZeroSpace,
    footerMark: kCarrierAc64BitMark,
    gap: kCarrierAc64Gap,
  };
  return new PulseBuilder(38000).genericBytes(t, b, false).signal();
}

/** The whole state goes in one message each press, so `prev` is not needed. */
export function carrier64AcSignal(s: AcState): IrSignal {
  return carrier64BytesToSignal(carrier64Bytes(s));
}
