import { PulseBuilder, reverseBits, setBits, sumBytes } from '@/ir/lgpl/irsend';
import { timing } from './timing';

const T = {
  hdrMark: 100,
  hdrSpace: 50,
  oneMark: 10,
  oneSpace: 30,
  zeroMark: 10,
  zeroSpace: 10,
  footerMark: 10,
  gap: 1000,
};

describe('PulseBuilder', () => {
  it('sends a generic message MSB first and LSB first', () => {
    expect(timing(new PulseBuilder(38000).genericBits(T, 0b10, 2, true).signal())).toBe(
      'f38000m100s50m10s30m10s10m10s1000',
    );
    expect(timing(new PulseBuilder(38000).genericBits(T, 0b10, 2, false).signal())).toBe(
      'f38000m100s50m10s10m10s30m10s1000',
    );
  });

  it('merges back-to-back spaces and marks, as the upstream test harness records them', () => {
    const b = new PulseBuilder(38000).mark(5).mark(5).space(3).space(4).mark(1).space(1);
    expect(b.signal().pattern).toEqual([10, 7, 1, 1]);
  });

  it('pads a message to mesgTime', () => {
    const p = new PulseBuilder(38000).genericBits(T, 1, 1, true, 5000).signal().pattern;
    expect(p.reduce((a, b) => a + b, 0)).toBe(5000);
  });

  it('sends bytes and bigints', () => {
    const a = new PulseBuilder(38000).genericBytes(T, [0x01, 0x80], false).signal();
    const b = new PulseBuilder(38000).genericBits(T, 0x8001n, 16, false).signal();
    expect(a).toEqual(b);
  });

  it('refuses a pattern that ends on a mark', () => {
    expect(() => new PulseBuilder(38000).mark(1).signal()).toThrow();
  });
});

describe('bit helpers', () => {
  it('reverses, sets and sums', () => {
    expect(reverseBits(0b0001, 4)).toBe(0b1000);
    expect(reverseBits(0x01, 8)).toBe(0x80);
    const b = [0xff];
    setBits(b, 0, 2, 3, 0);
    expect(b[0]).toBe(0b11100011);
    expect(sumBytes([0xff, 0x02, 0x10], 0, 2)).toBe(0x01);
  });
});
