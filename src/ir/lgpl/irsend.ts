/*
 * Mark/space builder shared by the AC encoders in this folder.
 *
 * Licence: GNU Lesser General Public License, version 2.1 (see ./LICENSE).
 *
 * Derived from IRremoteESP8266 v2.8.6, src/IRsend.cpp (IRsend::sendData, IRsend::sendGeneric) and
 * test/IRsend_test.h (IRsendTest::mark and ::space, which merge back-to-back marks or spaces),
 * Copyright 2009 Ken Shirriff, Copyright 2015 Mark Szabo, Copyright 2017 David Conran and
 * contributors. The source actually read was master at commit 1e2f0f3 (version 2.9.0, 2026-01-03).
 *
 * Changes made for One Remote:
 *  - Ported from C++ to TypeScript as a builder that collects durations instead of driving a pin.
 *  - Back-to-back marks (or spaces) are merged into one entry, as the upstream test harness records
 *    them, so a pattern always alternates mark, space and can be compared with the upstream tests.
 *  - Values wider than 32 bits are taken as bigint.
 *  - The message-time padding of sendGeneric (mesgtime) is taken as an argument of `footer`.
 */

import type { IrSignal } from '../emitter';

/** The timings of one bit cell, as passed to IRsend::sendData. */
export interface BitTiming {
  oneMark: number;
  oneSpace: number;
  zeroMark: number;
  zeroSpace: number;
}

/** sendGeneric's header, bit and footer timings. Zero header parts are skipped, as upstream. */
export interface GenericTiming extends BitTiming {
  hdrMark: number;
  hdrSpace: number;
  footerMark: number;
  gap: number;
}

export class PulseBuilder {
  private readonly out: number[] = [];
  /** Microseconds since the last `startMessage`, for sendGeneric's mesgtime. */
  private elapsed = 0;

  constructor(private readonly freqHz: number) {}

  mark(us: number): this {
    if (us <= 0) return this;
    this.elapsed += us;
    if (this.out.length % 2 === 1) this.addToLast(us);
    else this.out.push(us);
    return this;
  }

  private addToLast(us: number): void {
    const i = this.out.length - 1;
    this.out[i] = (this.out[i] ?? 0) + us;
  }

  space(us: number): this {
    if (us <= 0) return this;
    this.elapsed += us;
    // A space before any mark has nothing to follow; upstream records it, but a pattern starts
    // with a mark, so it is dropped.
    if (this.out.length === 0) return this;
    if (this.out.length % 2 === 0) this.addToLast(us);
    else this.out.push(us);
    return this;
  }

  /** IRsend::sendData. */
  data(t: BitTiming, value: number | bigint, nbits: number, msbFirst: boolean): this {
    const v = BigInt(value);
    for (let i = 0; i < nbits; i++) {
      const bit = msbFirst ? nbits - 1 - i : i;
      if ((v >> BigInt(bit)) & 1n) this.mark(t.oneMark).space(t.oneSpace);
      else this.mark(t.zeroMark).space(t.zeroSpace);
    }
    return this;
  }

  /** IRsend::sendData for each byte in turn (the byte form of sendGeneric). */
  bytes(t: BitTiming, bytes: ArrayLike<number>, msbFirst: boolean): this {
    for (let i = 0; i < bytes.length; i++) this.data(t, bytes[i] ?? 0, 8, msbFirst);
    return this;
  }

  startMessage(): this {
    this.elapsed = 0;
    return this;
  }

  header(t: Pick<GenericTiming, 'hdrMark' | 'hdrSpace'>): this {
    return this.startMessage().mark(t.hdrMark).space(t.hdrSpace);
  }

  /** The footer mark, then the gap, or longer so the message lasts at least `mesgTime`. */
  footer(t: Pick<GenericTiming, 'footerMark' | 'gap'>, mesgTime = 0): this {
    this.mark(t.footerMark);
    const gap = this.elapsed >= mesgTime ? t.gap : Math.max(t.gap, mesgTime - this.elapsed);
    return this.space(gap);
  }

  /** The byte form of IRsend::sendGeneric, one message. */
  genericBytes(t: GenericTiming, bytes: ArrayLike<number>, msbFirst: boolean): this {
    return this.header(t).bytes(t, bytes, msbFirst).footer(t);
  }

  /** The integer form of IRsend::sendGeneric, one message. */
  genericBits(
    t: GenericTiming,
    value: number | bigint,
    nbits: number,
    msbFirst: boolean,
    mesgTime = 0,
  ): this {
    return this.header(t).data(t, value, nbits, msbFirst).footer(t, mesgTime);
  }

  signal(): IrSignal {
    if (this.out.length % 2 === 1) throw new Error('an IR pattern must end with a space');
    return { freqHz: this.freqHz, pattern: [...this.out] };
  }
}

/** Two's-complement-free byte sum, as most checksums here use. */
export function sumBytes(b: ArrayLike<number>, from: number, to: number, init = 0): number {
  let s = init;
  for (let i = from; i < to; i++) s += b[i] ?? 0;
  return s & 0xff;
}

/** IRutils reverseBits for one value of `nbits`. */
export function reverseBits(v: number, nbits: number): number {
  let r = 0;
  for (let i = 0; i < nbits; i++) r = (r << 1) | ((v >>> i) & 1);
  return r >>> 0;
}

/** irutils::setBits on a byte array element: put `value` into `nbits` at `offset`. */
export function setBits(
  b: number[],
  i: number,
  offset: number,
  nbits: number,
  value: number,
): void {
  const mask = ((1 << nbits) - 1) << offset;
  b[i] = (((b[i] ?? 0) & ~mask) | ((value << offset) & mask)) & 0xff;
}

export function setBit(b: number[], i: number, bit: number, on: boolean): void {
  setBits(b, i, bit, 1, on ? 1 : 0);
}
