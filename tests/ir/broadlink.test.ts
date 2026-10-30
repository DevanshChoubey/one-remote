import { broadlinkToSignal } from '@/ir/broadlink';

const b64 = (bytes: number[]): string => Buffer.from(bytes).toString('base64');

describe('broadlinkToSignal', () => {
  it('decodes ticks, long pulses and pads odd patterns with a gap', () => {
    const s = broadlinkToSignal(
      b64([0x26, 0x00, 0x07, 0x00, 0x11, 0x22, 0x00, 0x01, 0x2c, 0x0d, 0x05]),
    );
    expect(s.freqHz).toBe(38000);
    expect(s.pattern).toEqual([558, 1116, 9851, 100000]);
  });

  it('keeps even patterns as they are', () => {
    const s = broadlinkToSignal(b64([0x26, 0x00, 0x04, 0x00, 0x11, 0x22, 0x0d, 0x05]));
    expect(s.pattern).toEqual([558, 1116]);
  });

  it('rejects non-IR packets', () => {
    expect(() => broadlinkToSignal(b64([0xb2, 0x00, 0x02, 0x00, 0x11, 0x22]))).toThrow(
      expect.objectContaining({ code: 'unsupported' }),
    );
  });
});
