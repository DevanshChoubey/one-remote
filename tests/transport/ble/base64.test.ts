// From aer-remote tests/ble/base64.test.ts (2026-11-04). Adapted: import path @/transport/ble/base64.
import { base64ToBytes, bytesToBase64 } from '@/transport/ble/base64';

describe('base64', () => {
  it.each([
    [[], ''],
    [[102], 'Zg=='],
    [[102, 111], 'Zm8='],
    [[102, 111, 111], 'Zm9v'],
    [[0, 255, 128, 7], 'AP+ABw=='],
  ])('round-trips %j', (arr, text) => {
    expect(bytesToBase64(Uint8Array.from(arr))).toBe(text);
    expect(Array.from(base64ToBytes(text))).toEqual(arr);
  });
});
