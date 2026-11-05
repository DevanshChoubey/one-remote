/*
 * Whirlpool air conditioner IR encoder (WHIRLPOOL_AC).
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/ir_Whirlpool.cpp and src/ir_Whirlpool.h, and the
 * IRac::whirlpool mapping and IRac::handleToggles in src/IRac.cpp, Copyright 2018 David Conran and
 * contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as pure functions. Kept: IRWhirlpoolAc stateReset, checksum,
 *    setModel, setTemp, setMode, setFan, setSwing, setLight, setSleep, setSuper(false),
 *    setPowerToggle, convertMode, convertFan, and IRsend::sendWhirlpoolAC (no repeats).
 *  - The setter sequence IRac runs on a fresh object is folded into one function, giving the same
 *    bytes. The command byte ends as Power, as it does there.
 *  - Power is a toggle. It is set when the power differs from `prev`; an unknown previous state is
 *    taken as off, as IRac does without one. So the app must know the AC's real power state (the
 *    setup step seeds it) or a press can turn the AC the wrong way.
 *  - Heat, super (jet), the clock and the timers are left out (clock and timers stay zero). The
 *    light is kept on (IRac turns it off unless asked; a remote leaves it on).
 */

import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { IrSignal } from '../emitter';
import { PulseBuilder, setBit, setBits, type GenericTiming } from './irsend';

export type WhirlpoolModel = 'dg11j13a' | 'dg11j191';

const kWhirlpoolAcHdrMark = 8950;
const kWhirlpoolAcHdrSpace = 4484;
const kWhirlpoolAcBitMark = 597;
const kWhirlpoolAcOneSpace = 1649;
const kWhirlpoolAcZeroSpace = 533;
const kWhirlpoolAcGap = 7920;
const kWhirlpoolAcMinGap = 100000; // kDefaultMessageGap
const kWhirlpoolAcStateLength = 21;
const kWhirlpoolAcChecksumByte1 = 13;
const kWhirlpoolAcChecksumByte2 = kWhirlpoolAcStateLength - 1;

const kWhirlpoolAcAuto = 1;
const kWhirlpoolAcCool = 2;
const kWhirlpoolAcDry = 3;
const kWhirlpoolAcFan = 4;
const kWhirlpoolAcFanAuto = 0;
const kWhirlpoolAcFanHigh = 1;
const kWhirlpoolAcFanMedium = 2;
const kWhirlpoolAcFanLow = 3;
const kWhirlpoolAcMinTemp = 18;
const kWhirlpoolAcMaxTemp = 32;
const kWhirlpoolAcCommandPower = 0x01;

/** IRWhirlpoolAc::getTempOffset: DG11J1-91 runs 16-30C. */
const OFFSET: Record<WhirlpoolModel, number> = { dg11j13a: 0, dg11j191: -2 };

const caps = (model: WhirlpoolModel): Capabilities => ({
  acModes: ['cool', 'dry', 'fan', 'auto'],
  acFan: ['auto', 1, 2, 3],
  setpoint: {
    min: kWhirlpoolAcMinTemp + OFFSET[model],
    max: kWhirlpoolAcMaxTemp + OFFSET[model],
  },
  swing: true,
  sleep: true,
});

export const WHIRLPOOL_CAPS: Record<WhirlpoolModel, Capabilities> = {
  dg11j13a: caps('dg11j13a'),
  dg11j191: caps('dg11j191'),
};

const MODE: Record<AcMode, number> = {
  cool: kWhirlpoolAcCool,
  dry: kWhirlpoolAcDry,
  fan: kWhirlpoolAcFan,
  auto: kWhirlpoolAcAuto,
};

/** IRWhirlpoolAc::convertFan. */
function fanBits(fan: AcFan): number {
  switch (fan) {
    case 'auto':
      return kWhirlpoolAcFanAuto;
    case 1:
      return kWhirlpoolAcFanLow;
    case 2:
      return kWhirlpoolAcFanMedium;
    case 3:
      return kWhirlpoolAcFanHigh;
  }
}

const xorBytes = (b: number[], from: number, to: number): number =>
  b.slice(from, to).reduce((x, v) => x ^ v, 0);

/** IRWhirlpoolAc::checksum: two XOR sums, of bytes 2 to 11 and of bytes 14 to 19. */
export function whirlpoolChecksum(raw: number[]): void {
  raw[kWhirlpoolAcChecksumByte1] = xorBytes(raw, 2, kWhirlpoolAcChecksumByte1 - 1);
  raw[kWhirlpoolAcChecksumByte2] = xorBytes(
    raw,
    kWhirlpoolAcChecksumByte1 + 1,
    kWhirlpoolAcChecksumByte2,
  );
}

/** The 21-byte state, as IRac::whirlpool builds it. `powerToggle` is the Power bit. */
export function whirlpoolBytes(s: AcState, model: WhirlpoolModel, powerToggle: boolean): number[] {
  const raw = new Array<number>(kWhirlpoolAcStateLength).fill(0);
  raw[0] = 0x83;
  raw[1] = 0x06;
  raw[6] = 0x80;
  setBit(raw, 18, 3, model === 'dg11j191'); // J191
  setBits(raw, 3, 0, 3, MODE[s.mode]); // Mode
  // setTemp runs after setMode, so it also overrides auto's fixed 23C.
  const temp = Math.round(clampSetpoint(s.setpoint, WHIRLPOOL_CAPS[model]));
  setBits(raw, 3, 4, 4, temp - (kWhirlpoolAcMinTemp + OFFSET[model])); // Temp
  // setSleep(true) forces the fan to low.
  setBits(raw, 2, 0, 2, s.sleep ? kWhirlpoolAcFanLow : fanBits(s.fan)); // Fan
  setBit(raw, 2, 7, s.swing); // Swing1
  setBit(raw, 8, 6, s.swing); // Swing2
  setBit(raw, 2, 3, s.sleep); // Sleep
  setBit(raw, 2, 2, powerToggle); // Power
  raw[15] = kWhirlpoolAcCommandPower; // Cmd
  whirlpoolChecksum(raw);
  return raw;
}

/** IRsend::sendWhirlpoolAC: three sections, the first with a header. */
export function whirlpoolBytesToSignal(raw: ArrayLike<number>): IrSignal {
  const t: GenericTiming = {
    hdrMark: kWhirlpoolAcHdrMark,
    hdrSpace: kWhirlpoolAcHdrSpace,
    oneMark: kWhirlpoolAcBitMark,
    oneSpace: kWhirlpoolAcOneSpace,
    zeroMark: kWhirlpoolAcBitMark,
    zeroSpace: kWhirlpoolAcZeroSpace,
    footerMark: kWhirlpoolAcBitMark,
    gap: kWhirlpoolAcGap,
  };
  const all = Array.from(raw);
  return new PulseBuilder(38000)
    .genericBytes(t, all.slice(0, 6), false)
    .startMessage()
    .bytes(t, all.slice(6, 14), false)
    .footer(t)
    .startMessage()
    .bytes(t, all.slice(14, 21), false)
    .footer({ footerMark: kWhirlpoolAcBitMark, gap: kWhirlpoolAcMinGap })
    .signal();
}

/** One message; the power bit toggles when the power differs from `prev` (unknown is off). */
export function whirlpoolAcSignal(
  next: AcState,
  prev: AcState | undefined,
  model: WhirlpoolModel,
): IrSignal {
  const toggle = next.power !== (prev?.power ?? false);
  return whirlpoolBytesToSignal(whirlpoolBytes(next, model, toggle));
}
