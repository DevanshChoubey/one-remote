// Gree local protocol: the `pack` field cipher. Written from the protocol description (key values,
// cipher modes, nonce and AAD are protocol facts); no code was taken from a GPL implementation.
import { ecb, gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { base64ToBytes, bytesToBase64 } from '@/transport/ble/base64';

/** Older firmware: AES-128-ECB with PKCS#7. Newer firmware: AES-128-GCM with a fixed nonce. */
export type GreeCipher = 'ecb' | 'gcm';

/** The keys every unit knows: they encrypt the scan reply and the bind exchange. */
export const GENERIC_KEY: Readonly<Record<GreeCipher, string>> = {
  ecb: 'a3K8Bx%2r8Y7#xDh',
  gcm: '{yxAHAY_Lm6pbC/<',
};

/** The fixed GCM nonce ("T@xDIgZQl^c" and 0x13) and AAD of the newer firmware. */
const GCM_NONCE = new Uint8Array([
  0x54, 0x40, 0x78, 0x44, 0x49, 0x67, 0x5a, 0x51, 0x6c, 0x5e, 0x63, 0x13,
]);
const GCM_AAD = utf8ToBytes('qualcomm-test');
const TAG_BYTES = 16;

/** An encrypted pack as it travels: base64 ciphertext and, for GCM, the base64 tag. */
export interface SealedPack {
  pack: string;
  tag?: string;
}

/** A pack that could not be encrypted or opened (wrong key, bad tag, not JSON). */
export class GreeCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GreeCryptoError';
    Object.setPrototypeOf(this, GreeCryptoError.prototype);
  }
}

function keyBytes(key: string): Uint8Array {
  const k = utf8ToBytes(key);
  if (k.length !== 16) throw new GreeCryptoError('A Gree key is 16 bytes');
  return k;
}

export function encryptPack(json: string, key: string, cipher: GreeCipher): SealedPack {
  const k = keyBytes(key);
  const plain = utf8ToBytes(json);
  if (cipher === 'ecb') return { pack: bytesToBase64(ecb(k).encrypt(plain)) };
  const out = gcm(k, GCM_NONCE, GCM_AAD).encrypt(plain);
  return {
    pack: bytesToBase64(out.subarray(0, out.length - TAG_BYTES)),
    tag: bytesToBase64(out.subarray(out.length - TAG_BYTES)),
  };
}

/** A decrypted pack is a JSON object; anything else means the key was wrong. */
function asJsonText(bytes: Uint8Array): string {
  let end = bytes.length;
  // Some firmware pads with zeros (or spaces) instead of PKCS#7.
  while (end > 0 && ((bytes[end - 1] ?? 0) === 0 || (bytes[end - 1] ?? 0) === 0x20)) end--;
  let text: string;
  try {
    text = bytesToUtf8(bytes.subarray(0, end));
  } catch {
    throw new GreeCryptoError('Not text');
  }
  if (!text.startsWith('{') || !text.endsWith('}')) throw new GreeCryptoError('Not a pack');
  return text;
}

export function decryptPack(sealed: SealedPack, key: string, cipher: GreeCipher): string {
  const k = keyBytes(key);
  const data = base64ToBytes(sealed.pack);
  if (cipher === 'gcm') {
    if (sealed.tag === undefined) throw new GreeCryptoError('A GCM pack needs its tag');
    const tag = base64ToBytes(sealed.tag);
    const joined = new Uint8Array(data.length + tag.length);
    joined.set(data);
    joined.set(tag, data.length);
    let plain: Uint8Array;
    try {
      plain = gcm(k, GCM_NONCE, GCM_AAD).decrypt(joined);
    } catch {
      throw new GreeCryptoError('The tag does not match');
    }
    return asJsonText(plain);
  }
  if (data.length === 0 || data.length % 16 !== 0) {
    throw new GreeCryptoError('Not whole AES blocks');
  }
  let plain: Uint8Array;
  try {
    plain = ecb(k).decrypt(data);
  } catch {
    // Not PKCS#7: decrypt the blocks as they are and let asJsonText drop the padding.
    plain = ecb(k, { disablePadding: true }).decrypt(data);
  }
  return asJsonText(plain);
}
