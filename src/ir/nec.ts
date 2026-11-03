import type { IrSignal } from './emitter';

const HDR_MARK = 9000;
const HDR_SPACE = 4500;
const BIT_MARK = 560;
const ONE_SPACE = 1690;
const ZERO_SPACE = 560;
const FRAME_US = 108000;

/** NEC is a public protocol. MSB first, 38 kHz, the frame padded to 108 ms. */
export function necSignal(code32: number): IrSignal {
  const pattern: number[] = [HDR_MARK, HDR_SPACE];
  for (let i = 31; i >= 0; i--) {
    const bit = (code32 >>> i) & 1;
    pattern.push(BIT_MARK, bit === 1 ? ONE_SPACE : ZERO_SPACE);
  }
  pattern.push(BIT_MARK);
  const used = pattern.reduce((a, b) => a + b, 0);
  pattern.push(FRAME_US - used);
  return { freqHz: 38000, pattern };
}
