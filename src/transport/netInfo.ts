import * as Network from 'expo-network';
import type { Prefix } from './localOnly';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function octets(address: string): [number, number, number, number] | null {
  const m = IPV4.exec(address);
  if (!m) return null;
  const n = m.slice(1, 5).map(Number);
  if (n.some((x) => x > 255)) return null;
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 0];
}

/**
 * The phone's on-link IPv4 prefix, or [] when it is not on Wi-Fi.
 * `expo-network` gives no netmask, so the prefix is the phone's address with `/24` (home routers
 * use /24). The Matter lane brings its own IPv6 prefixes.
 */
export async function getOnLinkPrefixes(): Promise<Prefix[]> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.type !== Network.NetworkStateType.WIFI) return [];
    const address = await Network.getIpAddressAsync();
    const o = octets(address);
    if (!o || o[0] === 0) return [];
    return [{ address, bits: 24 }];
  } catch {
    return [];
  }
}

/** Every host of an IPv4 /24, minus .0, .255 and the phone itself. */
export function subnetHosts(p: Prefix): string[] {
  const o = octets(p.address);
  if (!o || p.bits !== 24) return [];
  const out: string[] = [];
  for (let i = 1; i < 255; i++) {
    if (i !== o[3]) out.push(`${o[0]}.${o[1]}.${o[2]}.${i}`);
  }
  return out;
}

/** The directed broadcast address of an IPv4 /24. */
export function subnetBroadcast(p: Prefix): string {
  const o = octets(p.address);
  if (!o) throw new RangeError('Not an IPv4 address');
  return `${o[0]}.${o[1]}.${o[2]}.255`;
}
