import { GENERIC_KEY, GreeCryptoError, decryptPack, encryptPack } from '@/gree/crypto';

// Known answers made with Node's OpenSSL (an implementation independent of @noble/ciphers), from
// the documented generic keys: AES-128-ECB with PKCS#7, and AES-128-GCM with the fixed nonce and
// AAD the newer firmware uses.
const SCAN = '{"t":"scan"}';
const BIND = '{"mac":"f4911e000001","t":"bind","uid":0}';

describe('ECB packs', () => {
  it('match the known answers for the generic key', () => {
    expect(encryptPack(SCAN, GENERIC_KEY.ecb, 'ecb')).toEqual({ pack: 'VT6PQOWv+8FeevjTXFZdyQ==' });
    expect(encryptPack(BIND, GENERIC_KEY.ecb, 'ecb')).toEqual({
      pack: 'wQf9S7800vtjI4/LFXYqkYDub543PyG7VQUvN65CVRmj9mrs/0p7GUTdWxmNaBUt',
    });
  });

  it('decrypt the known answers', () => {
    expect(decryptPack({ pack: 'VT6PQOWv+8FeevjTXFZdyQ==' }, GENERIC_KEY.ecb, 'ecb')).toBe(SCAN);
  });

  it('round-trip with a device key and non-ASCII text', () => {
    const key = 'Kj8Hd72Lp0qWzX1c';
    const text = '{"name":"Bedroom AC é","t":"dev"}';
    expect(decryptPack(encryptPack(text, key, 'ecb'), key, 'ecb')).toBe(text);
  });

  it('tolerate zero padding from firmware that does not pad with PKCS#7', () => {
    // The 12 bytes of SCAN and 4 zero bytes, encrypted without padding (OpenSSL).
    expect(decryptPack({ pack: 'Zzs9FTHIWM16pzsPv/BrbA==' }, GENERIC_KEY.ecb, 'ecb')).toBe(SCAN);
    // Not a whole number of blocks.
    expect(() => decryptPack({ pack: 'AAAA' }, GENERIC_KEY.ecb, 'ecb')).toThrow(GreeCryptoError);
  });

  it('throw GreeCryptoError for the wrong key', () => {
    const { pack } = encryptPack(SCAN, GENERIC_KEY.ecb, 'ecb');
    expect(() => decryptPack({ pack }, 'wrongwrongwrong!', 'ecb')).toThrow(GreeCryptoError);
  });
});

describe('GCM packs', () => {
  it('match the known answers for the generic key', () => {
    expect(encryptPack(SCAN, GENERIC_KEY.gcm, 'gcm')).toEqual({
      pack: 'JtoKliwtupOy6N7K',
      tag: '4MYECKkr8e1oNZU2kblzAw==',
    });
    expect(encryptPack(BIND, GENERIC_KEY.gcm, 'gcm')).toEqual({
      pack: 'JtoT1XUt89K1ssWGayxFB59xuNIAzgWyIl52X7OFwurdNHgGiUNkepU=',
      tag: 'OcO4uUMKCLonpXuukhQMtg==',
    });
  });

  it('decrypt the known answers', () => {
    expect(
      decryptPack(
        { pack: 'JtoKliwtupOy6N7K', tag: '4MYECKkr8e1oNZU2kblzAw==' },
        GENERIC_KEY.gcm,
        'gcm',
      ),
    ).toBe(SCAN);
  });

  it('refuse a pack whose tag does not match, or that has none', () => {
    expect(() =>
      decryptPack(
        { pack: 'JtoKliwtupOy6N7L', tag: '4MYECKkr8e1oNZU2kblzAw==' },
        GENERIC_KEY.gcm,
        'gcm',
      ),
    ).toThrow(GreeCryptoError);
    expect(() => decryptPack({ pack: 'JtoKliwtupOy6N7K' }, GENERIC_KEY.gcm, 'gcm')).toThrow(
      GreeCryptoError,
    );
  });
});

describe('keys', () => {
  it('refuse a key that is not 16 bytes', () => {
    expect(() => encryptPack(SCAN, 'short', 'ecb')).toThrow(GreeCryptoError);
  });
});
