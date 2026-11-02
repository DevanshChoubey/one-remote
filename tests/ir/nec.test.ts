import { necSignal } from '@/ir/nec';

describe('necSignal', () => {
  const s = necSignal(0x20df10ef);

  it('is 38 kHz with 68 pattern entries', () => {
    expect(s.freqHz).toBe(38000);
    expect(s.pattern).toHaveLength(68);
  });

  it('starts with the header and 0x2 MSB first', () => {
    expect(s.pattern.slice(0, 8)).toEqual([9000, 4500, 560, 560, 560, 560, 560, 1690]);
  });

  it('ends with a trailer mark and pads the frame to 108000 us', () => {
    expect(s.pattern[66]).toBe(560);
    expect(s.pattern.reduce((a, b) => a + b, 0)).toBe(108000);
  });
});
