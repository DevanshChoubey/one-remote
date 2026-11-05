import { DeviceError } from '@/core';

const MAC_RE = /^([0-9a-f]{2})([:-][0-9a-f]{2}){5}$/i;

/** A Wake-on-LAN magic packet: 6 x 0xff, then the MAC 16 times (102 bytes). */
export function magicPacket(mac: string): Uint8Array {
  if (!MAC_RE.test(mac)) throw new DeviceError('unsupported', 'Not a MAC address');
  const bytes = mac.split(/[:-]/).map((h) => parseInt(h, 16));
  const out = new Uint8Array(6 + 16 * 6);
  out.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) out.set(bytes, 6 + i * 6);
  return out;
}
