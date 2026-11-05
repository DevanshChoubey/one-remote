import { DeviceError, type Unsubscribe } from '@/core';
import type { FoundTv } from '@/core/tvSetup';
import type { TvTransport } from '@/tv/transport';
import { fetchInfo } from './info';
import { INFO_PORT, WSS_PORT } from './url';

const ST = 'urn:samsung.com:device:RemoteControlReceiver:1';

export const SSDP_SEARCH: string = [
  'M-SEARCH * HTTP/1.1',
  'HOST: 239.255.255.250:1900',
  'MAN: "ssdp:discover"',
  'MX: 2',
  `ST: ${ST}`,
  '',
  '',
].join('\r\n');

function headers(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return out;
}

/** A Samsung TV from an SSDP reply; null for anything else. The name stays generic: the real one
 *  is read from the info page at pairing. */
export function parseSsdpReply(text: string, fromHost: string): FoundTv | null {
  const h = headers(text);
  const st = h.get('st') ?? '';
  const usnHeader = h.get('usn') ?? '';
  if (!st.includes(ST) && !usnHeader.includes(ST)) return null;
  const usn = usnHeader.split('::')[0] ?? '';
  return {
    kind: 'samsung',
    host: fromHost,
    name: 'Samsung TV',
    secure: true,
    ...(usn ? { usn } : {}),
  };
}

/** SSDP only: reports each Samsung reply once per host. Best effort: a transport error ends the
 *  search quietly. Stops reporting after unsubscribe. */
export function discoverSsdp(
  t: Pick<TvTransport, 'ssdpSearch'>,
  onFound: (tv: FoundTv) => void,
  opts: { ssdpMs?: number } = {},
): Unsubscribe {
  let stopped = false;
  const seen = new Set<string>();
  Promise.resolve()
    .then(() =>
      t.ssdpSearch(SSDP_SEARCH, opts.ssdpMs ?? 3000, (text, from) => {
        if (stopped) return;
        const tv = parseSsdpReply(text, from);
        if (!tv || seen.has(tv.host)) return;
        seen.add(tv.host);
        onFound(tv);
      }),
    )
    .catch(() => undefined);
  return () => {
    stopped = true;
  };
}

/** A TV only when BOTH 8001 and 8002 are open: 8001 alone is too common on home networks. */
export function samsungFromProbe(host: string, open: ReadonlySet<number>): FoundTv | null {
  if (!open.has(INFO_PORT) || !open.has(WSS_PORT)) return null;
  return { kind: 'samsung', host, name: 'Samsung TV', secure: true };
}

/** Checks one address: its info page must be a Samsung TV's. Rethrows `notLocal`. */
export async function probeSamsungHost(
  t: Pick<TvTransport, 'request'>,
  host: string,
): Promise<FoundTv | null> {
  try {
    const info = await fetchInfo(t, host);
    return { kind: 'samsung', host, name: info.name, secure: true };
  } catch (e) {
    if (e instanceof DeviceError && e.code === 'notLocal') throw e;
    return null;
  }
}
