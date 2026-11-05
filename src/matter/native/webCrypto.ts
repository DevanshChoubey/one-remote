import { ec } from '@matter/general';
import type { WebCrypto } from '@matter/general';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha1 } from '@noble/hashes/legacy';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2';
import { getRandomBytes } from 'expo-crypto';

/**
 * The slice of Web Crypto that matter.js's `StandardCrypto` calls, in plain JS. Hermes has no
 * `crypto.subtle`, and the Matter handshake needs only SHA-2, HMAC, HKDF, PBKDF2 and P-256, which
 * `@noble/*` covers. AES-CCM is already pure JS inside matter.js. Random bytes come from the OS
 * through `expo-crypto`.
 */

type Hash = typeof sha256;
type Algorithm = string | { name: string; hash?: string | { name: string }; [k: string]: unknown };
type Key =
  | { kind: 'raw'; bytes: Uint8Array; hash?: Hash }
  | { kind: 'ec'; jwk: { d?: string; x: string; y: string } };

const HASHES: Record<string, Hash> = {
  'SHA-1': sha1 as unknown as Hash,
  'SHA-256': sha256,
  'SHA-384': sha384 as unknown as Hash,
  'SHA-512': sha512 as unknown as Hash,
};

function hashOf(alg: Algorithm | undefined): Hash {
  const name = typeof alg === 'string' ? alg : alg?.name;
  const found = name === undefined ? undefined : HASHES[name];
  if (!found) throw new Error(`Unsupported hash ${String(name)}`);
  return found;
}

function hashParam(alg: Algorithm): Hash {
  return typeof alg === 'string' ? sha256 : hashOf(alg.hash as Algorithm);
}

function bytes(data: BufferSource | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toB64Url(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] ?? '';
    out += B64[(n >> 12) & 63] ?? '';
    if (i + 1 < b.length) out += B64[(n >> 6) & 63] ?? '';
    if (i + 2 < b.length) out += B64[n & 63] ?? '';
  }
  return out;
}

function fromB64Url(s: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('Bad base64url');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return Uint8Array.from(out);
}

function publicPoint(jwk: { x: string; y: string }): Uint8Array {
  return Uint8Array.from([4, ...fromB64Url(jwk.x), ...fromB64Url(jwk.y)]);
}

function keyOf(k: unknown): Key {
  return k as Key;
}

function ecKeyFrom(jwk: { d?: string; x?: string; y?: string }): Key {
  if (!jwk.x || !jwk.y) throw new Error('Not a P-256 key');
  return { kind: 'ec', jwk: { ...(jwk.d ? { d: jwk.d } : {}), x: jwk.x, y: jwk.y } };
}

const subtle = {
  digest(alg: Algorithm, data: BufferSource): Promise<ArrayBuffer> {
    return Promise.resolve(toBuffer(hashOf(alg)(bytes(data))));
  },

  importKey(
    format: string,
    data: BufferSource | { d?: string; x?: string; y?: string },
    alg: Algorithm,
  ): Promise<unknown> {
    try {
      if (format === 'raw') {
        const hash = typeof alg === 'object' && alg.name === 'HMAC' ? hashParam(alg) : undefined;
        return Promise.resolve({
          kind: 'raw',
          bytes: bytes(data as BufferSource),
          ...(hash ? { hash } : {}),
        } satisfies Key);
      }
      return Promise.resolve(ecKeyFrom(data as { d?: string; x?: string; y?: string }));
    } catch (e) {
      return Promise.reject(e);
    }
  },

  deriveBits(alg: Algorithm & { [k: string]: unknown }, base: unknown, length: number) {
    try {
      const key = keyOf(base);
      const size = length / 8;
      if (typeof alg === 'object' && alg.name === 'PBKDF2' && key.kind === 'raw') {
        const out = pbkdf2(hashParam(alg), key.bytes, bytes(alg.salt as BufferSource), {
          c: alg.iterations as number,
          dkLen: size,
        });
        return Promise.resolve(toBuffer(out));
      }
      if (typeof alg === 'object' && alg.name === 'HKDF' && key.kind === 'raw') {
        const out = hkdf(
          hashParam(alg),
          key.bytes,
          bytes(alg.salt as BufferSource),
          bytes(alg.info as BufferSource),
          size,
        );
        return Promise.resolve(toBuffer(out));
      }
      if (typeof alg === 'object' && alg.name === 'ECDH' && key.kind === 'ec') {
        const peer = keyOf(alg.public);
        if (peer.kind !== 'ec' || !key.jwk.d) throw new Error('Bad ECDH keys');
        const secret = ec.p256.getSharedSecret(fromB64Url(key.jwk.d), publicPoint(peer.jwk), true);
        return Promise.resolve(toBuffer(secret.slice(1)));
      }
      throw new Error(`Unsupported deriveBits ${String(typeof alg === 'string' ? alg : alg.name)}`);
    } catch (e) {
      return Promise.reject(e);
    }
  },

  sign(alg: Algorithm, base: unknown, data: BufferSource): Promise<ArrayBuffer> {
    try {
      const key = keyOf(base);
      const name = typeof alg === 'string' ? alg : alg.name;
      if (name === 'HMAC' && key.kind === 'raw' && key.hash) {
        return Promise.resolve(toBuffer(hmac(key.hash, key.bytes, bytes(data))));
      }
      if (name === 'ECDSA' && key.kind === 'ec' && key.jwk.d && typeof alg === 'object') {
        const sig = ec.p256.sign(bytes(data), fromB64Url(key.jwk.d), {
          prehash: true,
          format: 'compact',
        });
        return Promise.resolve(toBuffer(sig));
      }
      throw new Error(`Unsupported sign ${name}`);
    } catch (e) {
      return Promise.reject(e);
    }
  },

  verify(
    _alg: Algorithm,
    base: unknown,
    signature: BufferSource,
    data: BufferSource,
  ): Promise<boolean> {
    try {
      const key = keyOf(base);
      if (key.kind !== 'ec') throw new Error('Not an EC key');
      return Promise.resolve(
        ec.p256.verify(bytes(signature), bytes(data), publicPoint(key.jwk), {
          prehash: true,
          format: 'compact',
          // Other implementations (Web Crypto, devices) do not normalise S to the low half.
          lowS: false,
        }),
      );
    } catch {
      return Promise.resolve(false);
    }
  },

  generateKey(): Promise<{ privateKey: unknown; publicKey: unknown }> {
    const d = ec.p256.utils.randomSecretKey();
    const point = ec.p256.getPublicKey(d, false);
    const key = ecKeyFrom({
      d: toB64Url(d),
      x: toB64Url(point.slice(1, 33)),
      y: toB64Url(point.slice(33, 65)),
    });
    return Promise.resolve({ privateKey: key, publicKey: key });
  },

  exportKey(_format: string, base: unknown): Promise<unknown> {
    const key = keyOf(base);
    if (key.kind !== 'ec') return Promise.reject(new Error('Not an EC key'));
    return Promise.resolve({ kty: 'EC', crv: 'P-256', ...key.jwk });
  },
};

function toBuffer(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** A Web Crypto object `StandardCrypto` accepts: OS randomness and the JS `subtle` above. */
export function createWebCrypto(): WebCrypto {
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array) {
        const view = array as unknown as Uint8Array;
        view.set(getRandomBytes(view.byteLength));
      }
      return array;
    },
    subtle,
  } as unknown as WebCrypto;
}
