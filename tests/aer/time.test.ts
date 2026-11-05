// From aer-remote tests/device/time.test.ts (2026-11-04). Adapted: import path @/aer/time.
import { zoneInfo } from '@/aer/time';

describe('zoneInfo', () => {
  it('has no DST for Asia/Kolkata', () => {
    expect(zoneInfo('Asia/Kolkata', new Date('2026-10-26T00:00:00Z'))).toEqual({
      standardOffsetMin: 330,
      dstSavingsMs: 0,
    });
  });

  it('reports the standard offset and DST savings for Europe/London in summer', () => {
    expect(zoneInfo('Europe/London', new Date('2026-07-01'))).toEqual({
      standardOffsetMin: 0,
      dstSavingsMs: 3600000,
    });
  });

  it('reports the same values in winter', () => {
    expect(zoneInfo('Europe/London', new Date('2026-01-15'))).toEqual({
      standardOffsetMin: 0,
      dstSavingsMs: 3600000,
    });
  });

  it('handles southern-hemisphere DST', () => {
    expect(zoneInfo('Australia/Sydney', new Date('2026-01-15'))).toEqual({
      standardOffsetMin: 600,
      dstSavingsMs: 3600000,
    });
  });

  it('handles negative offsets', () => {
    expect(zoneInfo('America/New_York', new Date('2026-07-01'))).toEqual({
      standardOffsetMin: -300,
      dstSavingsMs: 3600000,
    });
  });
});
