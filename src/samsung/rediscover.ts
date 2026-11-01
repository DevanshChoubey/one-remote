import type { TvLink } from '@/core';
import type { FoundTv } from '@/core/tvSetup';
import type { TvTransport } from '@/tv/transport';
import { parseSsdpReply, samsungFromProbe, SSDP_SEARCH } from './discovery';
import { fetchInfo } from './info';
import { INFO_PORT, socketUrl, WSS_PORT } from './url';

const CHECK_MS = 1500;
const SSDP_MS = 3000;
const PROBE_MS = 1500;

/**
 * Finds the TV again after its address changed. Candidates come from SSDP and the subnet probe;
 * a candidate is accepted only when its info page shows `link.mac` AND a wss open with the pinned
 * certificate works. The check sends no token: the pin is checked in the TLS handshake and the MAC
 * on the info page, and a token could make the TV show an Allow prompt. At most
 * `maxCandidates` are checked, and the search gives up after `giveUpMs`. Returns the host or null.
 */
export function rediscoverSamsung(
  t: Pick<TvTransport, 'ssdpSearch' | 'probe' | 'request' | 'open'>,
  link: Extract<TvLink, { kind: 'samsung' }>,
  opts: { maxCandidates?: number; giveUpMs?: number } = {},
): Promise<string | null> {
  if (!link.mac) return Promise.resolve(null);
  const wantMac = link.mac.toLowerCase();
  const max = opts.maxCandidates ?? 3;

  const isSameTv = async (host: string): Promise<boolean> => {
    try {
      const info = await fetchInfo(t, host, CHECK_MS);
      if (info.mac?.toLowerCase() !== wantMac) return false;
      const sock = await t.open(socketUrl(host, ''), CHECK_MS, {
        pinSha256: link.pinSha256,
      });
      sock.close();
      return true;
    } catch {
      return false;
    }
  };

  return new Promise<string | null>((resolve) => {
    const queue: FoundTv[] = [];
    const queued = new Set<string>();
    let tried = 0;
    let busy = false;
    let pending = 2;
    let finished = false;

    const finish = (host: string | null): void => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      resolve(host);
    };
    const guard = setTimeout(() => finish(null), opts.giveUpMs ?? 20000);

    const pump = async (): Promise<void> => {
      if (busy || finished) return;
      busy = true;
      while (!finished && tried < max && queue.length > 0) {
        // The link's own address is the caller's job: look elsewhere first.
        const elsewhere = queue.findIndex((c) => c.host !== link.host);
        if (elsewhere < 0 && pending > 0) break;
        const [tv] = queue.splice(Math.max(0, elsewhere), 1);
        if (!tv) break;
        tried += 1;
        if (await isSameTv(tv.host)) {
          finish(tv.host);
          return;
        }
      }
      busy = false;
      if (!finished && (tried >= max || (pending === 0 && queue.length === 0))) finish(null);
    };

    const add = (tv: FoundTv): void => {
      if (queued.has(tv.host)) return;
      queued.add(tv.host);
      queue.push(tv);
      void pump();
    };
    const settle = (): void => {
      pending -= 1;
      void pump();
    };

    Promise.resolve()
      .then(() =>
        t.ssdpSearch(SSDP_SEARCH, SSDP_MS, (text, from) => {
          const tv = finished ? null : parseSsdpReply(text, from);
          if (tv) add(tv);
        }),
      )
      .catch(() => undefined)
      .then(settle);
    Promise.resolve()
      .then(() =>
        t.probe(
          [INFO_PORT, WSS_PORT],
          PROBE_MS,
          () => undefined,
          () => finished,
          (host, open) => {
            const tv = samsungFromProbe(host, new Set(open));
            if (tv) add(tv);
          },
        ),
      )
      .catch(() => undefined)
      .then(settle);
  });
}
