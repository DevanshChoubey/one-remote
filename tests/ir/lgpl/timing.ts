// Helpers to compare our signals with the timing strings in IRremoteESP8266's tests
// (IRsendTest::outputStr: "f<freq>d<duty>" then alternating m<mark>s<space>).
import type { IrSignal } from '@/ir/emitter';

/** Our signal as an upstream timing string, without the duty cycle (we do not set one). */
export function timing(s: IrSignal | IrSignal[]): string {
  const list = Array.isArray(s) ? s : [s];
  let out = '';
  let freq = 0;
  for (const sig of list) {
    if (sig.freqHz !== freq) out += `f${sig.freqHz}`;
    freq = sig.freqHz;
    sig.pattern.forEach((us, i) => {
      out += `${i % 2 === 0 ? 'm' : 's'}${us}`;
    });
  }
  return out;
}

/** An upstream timing string with the duty cycle markers removed. */
export function upstream(s: string): string {
  return s.replace(/d\d+/g, '');
}

/** Bytes as a list, for readable equality failures. */
export const hex = (b: ArrayLike<number>): number[] => Array.from(b);
