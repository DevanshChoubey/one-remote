import { webcrypto } from 'node:crypto';
import { Bytes, StandardCrypto } from '@matter/general';
import type { WebCrypto } from '@matter/general';
import { createWebCrypto } from '@/matter/native/webCrypto';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('node:crypto').webcrypto.getRandomValues(new Uint8Array(n)),
}));

const mine = new StandardCrypto(createWebCrypto());
const reference = new StandardCrypto(webcrypto as unknown as WebCrypto);
const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);

describe('matter crypto without crypto.subtle', () => {
  it('hashes like Web Crypto', async () => {
    const data = bytes(1, 2, 3, 4);
    for (const alg of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const) {
      expect(Bytes.of(await mine.computeHash(data, alg))).toEqual(
        Bytes.of(await reference.computeHash(data, alg)),
      );
    }
  });

  it('derives PBKDF2, HKDF and HMAC like Web Crypto', async () => {
    const secret = bytes(9, 8, 7);
    const salt = bytes(1, 1, 2, 3, 5, 8);
    expect(Bytes.of(await mine.createPbkdf2Key(secret, salt, 1000, 80))).toEqual(
      Bytes.of(await reference.createPbkdf2Key(secret, salt, 1000, 80)),
    );
    expect(Bytes.of(await mine.createHkdfKey(secret, salt, bytes(5, 5), 48))).toEqual(
      Bytes.of(await reference.createHkdfKey(secret, salt, bytes(5, 5), 48)),
    );
    expect(Bytes.of(await mine.signHmac(secret, salt))).toEqual(
      Bytes.of(await reference.signHmac(secret, salt)),
    );
  });

  it('signs ECDSA that Web Crypto verifies, and verifies what Web Crypto signs', async () => {
    const key = await reference.createKeyPair();
    const data = bytes(4, 5, 6);
    const sig = await mine.signEcdsa(key, data);
    await expect(reference.verifyEcdsa(key, data, sig)).resolves.toBeUndefined();
    const theirs = await reference.signEcdsa(key, data);
    await expect(mine.verifyEcdsa(key, data, theirs)).resolves.toBeUndefined();
    await expect(mine.verifyEcdsa(key, bytes(0), theirs)).rejects.toThrow();
  });

  it('agrees with Web Crypto on a Diffie-Hellman secret', async () => {
    const a = await mine.createKeyPair();
    const b = await reference.createKeyPair();
    const { d: _d, ...peer } = b;
    expect(Bytes.of(await mine.generateDhSecret(a, peer as typeof b))).toEqual(
      Bytes.of(await reference.generateDhSecret(a, peer as typeof b)),
    );
  });

  it('draws random bytes and round-trips AES-CCM', () => {
    expect(mine.randomBytes(16)).toHaveLength(16);
    const key = mine.randomBytes(16);
    const nonce = mine.randomBytes(13);
    const sealed = mine.encrypt(key, bytes(1, 2, 3), nonce, bytes(9));
    expect(Bytes.of(mine.decrypt(key, sealed, nonce, bytes(9)))).toEqual(bytes(1, 2, 3));
  });
});
