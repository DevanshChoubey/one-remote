import { normaliseCode, pairingSecret } from '@/androidtv/secret';

const hex = (b: Uint8Array): string =>
  [...b]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const client = { modulusHex: 'B1C2D3E4F5061728394A5B6C7D8E9FA0', exponentHex: '10001' };
const server = { modulusHex: 'E5D4C3B2A19080706F5E4D3C2B1A0918', exponentHex: '10001' };

test('the right code gives the reference digest', () =>
  expect(hex(pairingSecret(client, server, '2A3A7F')!)).toBe(
    '2A022F5AE10B20BB054691D3D27BF3D4B9E0F12C98CD68E887B4FD61C122ED5A',
  ));
test('a wrong first byte is null', () =>
  expect(pairingSecret(client, server, '2B3A7F')).toBeNull());
test('the ASCII-hash reading (first byte DD) is rejected', () =>
  expect(pairingSecret(client, server, 'DD3A7F')).toBeNull());
test('suffix 0000 gives first byte DE', () =>
  expect(pairingSecret(client, server, 'DE0000')?.[0]).toBe(0xde));
test('an odd-length modulus is left-padded', () =>
  expect(pairingSecret({ modulusHex: 'ABC', exponentHex: '10001' }, server, '253A7F')?.[0]).toBe(
    0x25,
  ));
test('the odd-length exponent 10001 hashes as 01 00 01', () =>
  expect(pairingSecret(client, server, '2A3A7F')).not.toBeNull());
test.each([
  [' 2a 3a7f ', '2A3A7F'],
  ['2A3A7G', null],
  ['2A3A7', null],
  ['2A3A7F0', null],
])('normaliseCode(%p) = %p', (typed, want) => expect(normaliseCode(typed)).toBe(want));
