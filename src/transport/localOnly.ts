import { DeviceError } from '@/core';

/** An on-link network prefix of the phone, e.g. `{ address: '192.168.1.7', bits: 24 }`. */
export type Prefix = { address: string; bits: number };

type Ip = { v: 4; n: number } | { v: 6; g: number[] };

const DECIMAL_OCTET = /^(0|[1-9]\d{0,2})$/;
const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/;
const ZONE_ID = /^[A-Za-z0-9_.-]{1,64}$/;

function parseV4(s: string): number | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!DECIMAL_OCTET.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = n * 256 + o;
  }
  return n;
}

function parseV6(input: string): number[] | null {
  let s = input;
  const pct = s.indexOf('%');
  if (pct >= 0) {
    const zone = s.slice(pct + 1);
    // A zone is an interface name or index; anything else (`@`, `/`, `]`...) could become a URL part.
    if (!ZONE_ID.test(zone)) return null;
    s = s.slice(0, pct);
  }
  if (!s.includes(':')) return null;

  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  const last = s.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = parseV4(last);
    if (v4 === null) return null;
    tail = [Math.floor(v4 / 65536), v4 % 65536];
    s = s.slice(0, lastColon + 1);
    // "a::" + v4 keeps the "::"; "a:b:c:d:e:f:" + v4 must drop the single trailing colon.
    if (!s.endsWith('::')) s = s.slice(0, -1);
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parseGroups = (h: string): number[] | null => {
    if (h === '') return [];
    const out: number[] = [];
    for (const g of h.split(':')) {
      if (!HEX_GROUP.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = parseGroups(halves[0] ?? '');
  if (head === null) return null;
  if (halves.length === 1) {
    const all = [...head, ...tail];
    return all.length === 8 ? all : null;
  }
  const rest = parseGroups(halves[1] ?? '');
  if (rest === null) return null;
  const fill = 8 - head.length - rest.length - tail.length;
  if (fill < 1) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...rest, ...tail];
}

function parse(input: string): Ip | null {
  if (input.includes(':')) {
    const g = parseV6(input);
    return g === null ? null : { v: 6, g };
  }
  if (input.includes('%')) return null;
  const n = parseV4(input);
  return n === null ? null : { v: 4, n };
}

/** An IPv4-mapped IPv6 address is judged as its IPv4 part. */
function unmap(ip: Ip): Ip {
  if (ip.v === 6 && ip.g.slice(0, 5).every((x) => x === 0) && ip.g[5] === 0xffff) {
    return { v: 4, n: (ip.g[6] ?? 0) * 65536 + (ip.g[7] ?? 0) };
  }
  return ip;
}

function inV4(n: number, base: number, bits: number): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(n / size) === Math.floor(base / size);
}

function inV6(g: number[], base: number[], bits: number): boolean {
  let left = bits;
  for (let i = 0; i < 8 && left > 0; i++) {
    const take = Math.min(16, left);
    const shift = 16 - take;
    if ((g[i] ?? 0) >> shift !== (base[i] ?? 0) >> shift) return false;
    left -= take;
  }
  return true;
}

type ParsedPrefix = { ip: Ip; bits: number };

function parsePrefix(p: Prefix): ParsedPrefix | null {
  const ip = parse(p.address);
  if (ip === null || !Number.isInteger(p.bits)) return null;
  const max = ip.v === 4 ? 32 : 128;
  // A prefix shorter than /8 (v4) or /16 (v6), e.g. from a VPN, would make most of the internet local.
  const min = ip.v === 4 ? 8 : 16;
  if (p.bits < min || p.bits > max) return null;
  return { ip, bits: p.bits };
}

function onLink(ip: Ip, prefixes: Prefix[]): boolean {
  for (const raw of prefixes) {
    const p = parsePrefix(raw);
    if (p === null) continue;
    // A mapped on-link prefix would be a v4 prefix with +96 bits; not supported, keep it v6-only.
    if (ip.v === 4 && p.ip.v === 4 && inV4(ip.n, p.ip.n, p.bits)) return true;
    if (ip.v === 6 && p.ip.v === 6 && inV6(ip.g, p.ip.g, p.bits)) return true;
  }
  return false;
}

/**
 * True when `ip` is a private, loopback, link-local or on-link unicast address. Unspecified,
 * broadcast and multicast addresses are never local. Invalid input is false.
 */
export function isLocalAddress(ip: string, prefixes: Prefix[]): boolean {
  const parsed = parse(ip);
  if (parsed === null) return false;
  const a = unmap(parsed);
  if (a.v === 4) {
    const first = Math.floor(a.n / 2 ** 24);
    if (first === 0 || first >= 224) return false; // 0/8, multicast, reserved, broadcast
    const second = Math.floor(a.n / 2 ** 16) % 256;
    if (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    ) {
      return true;
    }
    return onLink(a, prefixes);
  }
  const g0 = a.g[0] ?? 0;
  if (a.g.every((x) => x === 0)) return false; // ::
  if (g0 >= 0xff00) return false; // multicast
  if ((g0 & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if (a.g.slice(0, 7).every((x) => x === 0) && a.g[7] === 1) return true; // ::1
  return onLink(a, prefixes);
}

/** Only the mDNS/SSDP v4 groups and any ff02::/16 (link-local) v6 group. */
export function isAllowedMulticast(ip: string): boolean {
  const a = parse(ip);
  if (a === null) return false;
  if (a.v === 4) return a.n === 0xefffff_fa || a.n === 0xe00000_fb;
  return a.g[0] === 0xff02;
}

/** True only for the directed broadcast address of an IPv4 on-link prefix with bits <= 30. */
export function isSubnetBroadcast(ip: string, prefixes: Prefix[]): boolean {
  const a = parse(ip);
  if (a === null || a.v !== 4) return false;
  for (const raw of prefixes) {
    const p = parsePrefix(raw);
    if (p === null || p.ip.v !== 4 || p.bits > 30) continue;
    const size = 2 ** (32 - p.bits);
    const broadcast = Math.floor(p.ip.n / size) * size + size - 1;
    if (a.n === broadcast) return true;
  }
  return false;
}

/** Throws `DeviceError('notLocal')` unless `ip` is a local unicast address. */
export function assertLocal(ip: string, prefixes: Prefix[]): void {
  if (!isLocalAddress(ip, prefixes)) {
    throw new DeviceError('notLocal', 'Address is not on the local network');
  }
}
