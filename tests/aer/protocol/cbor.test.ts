// From aer-remote tests/protocol/cbor.test.ts (2026-11-04). Adapted: imports now use @/aer/protocol.
import { CborError, decodeFirst, encodeMap, type CborValue } from '@/aer/protocol/cbor';

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (s: string): Uint8Array =>
  new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

const SPRAY_NOW = 'bf626d541868626d4e189a62724900ff';

describe('cbor', () => {
  it('encodes spray-now exactly like the vendor app', () => {
    const out = encodeMap([
      ['mT', 104],
      ['mN', 154],
      ['rI', 0],
    ]);
    expect(hex(out)).toBe(SPRAY_NOW);
  });

  it('forces 8-byte ints', () => {
    const out = encodeMap([['eP', 1761500000, { uint64: true }]]);
    expect(hex(out)).toBe('bf' + '626550' + '1b0000000068fe5b60' + 'ff');
  });

  it('encodes shortest-form ints, negatives, bools, null and bigint', () => {
    expect(hex(encodeMap([['a', 23]]))).toBe('bf6161' + '17' + 'ff');
    expect(hex(encodeMap([['a', 24]]))).toBe('bf6161' + '1818' + 'ff');
    expect(hex(encodeMap([['a', 256]]))).toBe('bf6161' + '190100' + 'ff');
    expect(hex(encodeMap([['a', 65536]]))).toBe('bf6161' + '1a00010000' + 'ff');
    expect(hex(encodeMap([['a', 4294967296]]))).toBe('bf6161' + '1b0000000100000000' + 'ff');
    expect(hex(encodeMap([['a', -1]]))).toBe('bf6161' + '20' + 'ff');
    expect(hex(encodeMap([['a', -330]]))).toBe('bf6161' + '390149' + 'ff');
    expect(hex(encodeMap([['a', true]]))).toBe('bf6161' + 'f5' + 'ff');
    expect(hex(encodeMap([['a', false]]))).toBe('bf6161' + 'f4' + 'ff');
    expect(hex(encodeMap([['a', null]]))).toBe('bf6161' + 'f6' + 'ff');
    expect(hex(encodeMap([['a', 2n ** 63n]]))).toBe('bf6161' + '1b8000000000000000' + 'ff');
    expect(hex(encodeMap([['a', -(2n ** 40n)]]))).toBe('bf6161' + '3b' + '000000ffffffffff' + 'ff');
  });

  it('encodes strings including multi-byte UTF-8, and rejects bad numbers', () => {
    expect(hex(encodeMap([['a', 'hé€😀']]))).toBe(
      'bf6161' + '6a' + '68' + 'c3a9' + 'e282ac' + 'f09f9880' + 'ff',
    );
    expect(hex(encodeMap([['a', 'x'.repeat(30)]]))).toBe(
      'bf6161' + '781e' + '78'.repeat(30) + 'ff',
    );
    expect(() => encodeMap([['a', 1.5]])).toThrow(CborError);
    expect(() => encodeMap([['a', -(2n ** 64n) - 1n]])).toThrow(CborError);
    expect(() => encodeMap([['a', 2n ** 64n]])).toThrow(CborError);
    expect(() => encodeMap([['a', -1, { uint64: true }]])).toThrow(CborError);
  });

  it('round-trips nested arrays of maps with bytes', () => {
    const value: CborValue = { S: [{ s: new Uint8Array([0x7c, 8, 0, 42, 20]) }] };
    const bytes = encodeMap([['S', value.S as CborValue]]);
    expect(hex(bytes)).toBe('bf6153' + '9f' + 'bf6173' + '457c0800' + '2a14' + 'ff' + 'ff' + 'ff');
    const decoded = decodeFirst(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded?.length).toBe(bytes.length);
    expect(decoded?.value).toEqual({ S: [{ s: new Uint8Array([0x7c, 8, 0, 42, 20]) }] });
  });

  it('encodes nested maps indefinite in insertion order', () => {
    const bytes = encodeMap([['m', { b: 1, a: 2 }]]);
    expect(hex(bytes)).toBe('bf616d' + 'bf' + '616201' + '616102' + 'ff' + 'ff');
  });

  it('decodeFirst returns null on a truncated frame', () => {
    const full = fromHex(SPRAY_NOW);
    expect(decodeFirst(full.slice(0, full.length - 1))).toBeNull();
    expect(decodeFirst(new Uint8Array(0))).toBeNull();
  });

  it('decodeFirst reports consumed length', () => {
    const a = fromHex(SPRAY_NOW);
    const b = encodeMap([['x', 1]]);
    const both = new Uint8Array(a.length + b.length);
    both.set(a, 0);
    both.set(b, a.length);
    const first = decodeFirst(both);
    expect(first?.length).toBe(a.length);
    expect(first?.value).toEqual({ mT: 104, mN: 154, rI: 0 });
    const second = decodeFirst(both.slice(first?.length ?? 0));
    expect(second?.value).toEqual({ x: 1 });
  });

  it('decodes negative ints', () => {
    const bytes = encodeMap([['tZ', -330]]);
    expect(decodeFirst(bytes)?.value).toEqual({ tZ: -330 });
  });

  it('decodes all int widths and promotes unsafe values to bigint', () => {
    const d = (h: string): CborValue | undefined => decodeFirst(fromHex(h))?.value;
    expect(d('17')).toBe(23);
    expect(d('1818')).toBe(24);
    expect(d('190100')).toBe(256);
    expect(d('1a00010000')).toBe(65536);
    expect(d('1b0000000068fe5b60')).toBe(1761500000);
    expect(d('1b8000000000000000')).toBe(2n ** 63n);
    expect(d('1b001fffffffffffff')).toBe(Number.MAX_SAFE_INTEGER);
    expect(d('3b8000000000000000')).toBe(-(2n ** 63n) - 1n);
    expect(d('3801')).toBe(-2);
    expect(d('f5')).toBe(true);
    expect(d('f4')).toBe(false);
    expect(d('f6')).toBeNull();
  });

  it('decodes definite and indefinite containers, text and bytes', () => {
    const d = (h: string): CborValue | undefined => decodeFirst(fromHex(h))?.value;
    expect(d('a1616101')).toEqual({ a: 1 });
    expect(d('8201 02'.replace(' ', ''))).toEqual([1, 2]);
    expect(d('9f0102ff')).toEqual([1, 2]);
    expect(d('62c3a9')).toBe('é');
    expect(d('63e282ac')).toBe('€');
    expect(d('64f09f9880')).toBe('😀');
    expect(d('4301 0203'.replace(' ', ''))).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('throws CborError on unsupported or malformed input', () => {
    const d = (h: string): unknown => decodeFirst(fromHex(h));
    expect(() => d('fa3fc00000')).toThrow(CborError); // float32
    expect(() => d('c101')).toThrow(CborError); // tag
    expect(() => d('f7')).toThrow(CborError); // undefined
    expect(() => d('5f4101ff')).toThrow(CborError); // indefinite bytes
    expect(() => d('a10101')).toThrow(CborError); // non-text key
    expect(() => d('ff')).toThrow(CborError); // stray break
    expect(() => d('1c')).toThrow(CborError); // reserved info
    expect(() => d('61c3')).toThrow(CborError); // truncated UTF-8
    expect(() => d('61ff')).toThrow(CborError); // invalid UTF-8
  });
});
