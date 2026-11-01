import { sha256 } from '@noble/hashes/sha2';
import { concatBytes, hexToBytes } from '@noble/hashes/utils';

/** RSA public key halves as upper-case hex without leading zeros. */
export interface RsaPublic {
  modulusHex: string;
  exponentHex: string;
}

/** Upper-cases and drops spaces; null unless exactly 6 characters of 0-9A-F. */
export function normaliseCode(typed: string): string | null {
  const code = typed.replace(/\s+/g, '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(code) ? code : null;
}

/** The bytes a hex string decodes to; an odd length is left-padded to whole bytes (so the
 *  exponent "10001" is 01 00 01). */
const bytesOf = (h: string): Uint8Array => hexToBytes(h.length % 2 ? `0${h}` : h);

/** The 32-byte secret for `code`, or null when its first byte doesn't match (wrong code). */
export function pairingSecret(
  client: RsaPublic,
  server: RsaPublic,
  code: string,
): Uint8Array | null {
  const d = sha256(
    concatBytes(
      bytesOf(client.modulusHex),
      bytesOf(client.exponentHex),
      bytesOf(server.modulusHex),
      bytesOf(server.exponentHex),
      hexToBytes(code.slice(2)), // last 4 hex digits = 2 bytes
    ),
  );
  return d[0] === parseInt(code.slice(0, 2), 16) ? d : null;
}
