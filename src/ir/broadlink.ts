import { DeviceError } from '@/core';
import type { IrSignal } from './emitter';

const IR_PACKET = 0x26;
const TICK_NUM = 269000;
const TICK_DEN = 8192; // one tick is 269/8192 ms
const TRAILING_GAP_US = 100000;

function base64Bytes(base64: string): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of base64.replace(/=+$/, '')) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new DeviceError('unsupported', 'bad base64');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return out;
}

/** Decodes a Broadlink IR packet (type 0x26) into microseconds. Always 38 kHz. */
export function broadlinkToSignal(base64: string): IrSignal {
  const b = base64Bytes(base64);
  if (b[0] !== IR_PACKET || b.length < 4) throw new DeviceError('unsupported', 'not an IR packet');
  const len = (b[2] ?? 0) | ((b[3] ?? 0) << 8);
  const end = Math.min(b.length, 4 + len);
  const pattern: number[] = [];
  let i = 4;
  while (i < end) {
    let ticks = b[i] ?? 0;
    if (ticks === 0x0d && b[i + 1] === 0x05) break;
    if (ticks === 0) {
      ticks = ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
      i += 3;
    } else {
      i += 1;
    }
    pattern.push(Math.round((ticks * TICK_NUM) / TICK_DEN));
  }
  if (pattern.length % 2 === 1) pattern.push(TRAILING_GAP_US);
  return { freqHz: 38000, pattern };
}
