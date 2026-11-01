import { DeviceError, type Unsubscribe } from '@/core';
import type { FoundTv } from '@/core/tvSetup';
import type { TvTransport } from './transport';

const ST = 'urn:lge-com:service:webos-second-screen:1';

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

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** A webOS TV from an SSDP reply; null for anything else on the network. */
export function parseSsdpReply(text: string, fromHost: string): FoundTv | null {
  const h = headers(text);
  const stHeader = h.get('st') ?? '';
  const usnHeader = h.get('usn') ?? '';
  if (!stHeader.includes(ST) && !usnHeader.includes(ST)) return null;
  const usn = usnHeader.split('::')[0] ?? '';
  const name = decode(h.get('dlnadevicename.lge.com') ?? '')
    .replace(/^\[LG\]\s*/, '')
    .trim();
  return {
    host: fromHost,
    name: name || 'LG TV',
    secure: false,
    ...(usn ? { usn } : {}),
  };
}

/** SSDP and the subnet probe together, de-duplicated by host (a host is reported again only when
 *  the probe shows it is secure-only: callers replace by host). Both are best-effort: a transport
 *  error ends that search quietly. `onDone` fires once both have ended (not after unsubscribe). */
export function discoverTvs(
  t: TvTransport,
  onFound: (tv: FoundTv) => void,
  opts: { ssdpMs?: number; probeMs?: number; onDone?: () => void } = {},
): Unsubscribe {
  const ssdpMs = opts.ssdpMs ?? 3000;
  const probeMs = opts.probeMs ?? 1500;
  let stopped = false;
  let pending = 2;
  const seen = new Map<string, FoundTv>();
  const plain = new Set<string>();
  const tlsOnly = new Set<string>();

  const emit = (tv: FoundTv): void => {
    if (stopped || seen.has(tv.host)) return;
    seen.set(tv.host, tv);
    onFound(tv);
  };
  const settle = (): void => {
    pending -= 1;
    if (pending === 0 && !stopped) opts.onDone?.();
  };

  Promise.resolve()
    .then(() =>
      t.ssdpSearch(SSDP_SEARCH, ssdpMs, (text, from) => {
        const tv = parseSsdpReply(text, from);
        if (tv) emit(tv);
      }),
    )
    .catch(() => undefined)
    .then(settle);

  Promise.resolve()
    .then(() =>
      t.probe(
        [3000, 3001],
        probeMs,
        (host, port) => {
          if (port === 3000) {
            plain.add(host);
            emit({ host, name: 'LG TV', secure: false });
          } else if (port === 3001) {
            tlsOnly.add(host);
          }
        },
        () => stopped,
      ),
    )
    .catch(() => undefined)
    .then(() => {
      for (const host of tlsOnly) {
        if (plain.has(host) || stopped) continue;
        const prev = seen.get(host);
        if (!prev) {
          emit({ host, name: 'LG TV', secure: true });
        } else if (!prev.secure) {
          // SSDP cannot tell; the probe saw only the TLS port. Report the host again, secure.
          const upgraded = { ...prev, secure: true };
          seen.set(host, upgraded);
          onFound(upgraded);
        }
      }
      settle();
    });

  return () => {
    stopped = true;
  };
}

/** Checks one address for a webOS socket. Throws DeviceError('notLocal') for a non-home address. */
export async function probeHost(t: TvTransport, host: string): Promise<FoundTv | null> {
  const attempts: { url: string; secure: boolean }[] = [
    { url: `ws://${host}:3000`, secure: false },
    { url: `wss://${host}:3001`, secure: true },
  ];
  for (const a of attempts) {
    try {
      // Only checks that the socket opens (nothing is sent), so the TLS port is tried as if pairing.
      (await t.open(a.url, 1500, a.secure ? { pairing: true } : undefined)).close();
      return { host, name: 'LG TV', secure: a.secure };
    } catch (e) {
      if (e instanceof DeviceError && e.code === 'notLocal') throw e;
    }
  }
  return null;
}
