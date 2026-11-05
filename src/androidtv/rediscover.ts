import type { TvLink } from '@/core';
import { REMOTE_PORT, SERVICE_TYPE, type AtvTransport } from './constants';

type AtvLink = Extract<TvLink, { kind: 'androidtv' }>;

/**
 * Finds the TV again after its address changed, by certificate pin. Candidates come from mDNS and
 * the 6466 probe as they arrive, each host once, the link's own host last. The first that completes
 * TLS on 6466 against `link.pinSha256` (with the phone identity) wins: each TV has its own
 * self-signed certificate, so another TV never matches. At most `maxCandidates` TLS checks, each
 * within `checkMs`; null after `giveUpMs`.
 */
export async function findAndroidTvByPin(
  t: Pick<AtvTransport, 'mdnsBrowse' | 'probe' | 'openStream'>,
  link: AtvLink,
  opts: {
    checkMs?: number;
    maxCandidates?: number;
    giveUpMs?: number;
    browseMs?: number;
    probeMs?: number;
  } = {},
): Promise<string | null> {
  const checkMs = opts.checkMs ?? 1500;
  const max = opts.maxCandidates ?? 5;
  const giveUpMs = opts.giveUpMs ?? 20000;
  const browseMs = opts.browseMs ?? 3000;
  const probeMs = opts.probeMs ?? 1500;

  let over = false;
  const queue: string[] = [];
  const seen = new Set<string>([link.host]); // the own host is added last, by hand
  let sourcesLeft = 2;
  let wake: (() => void) | undefined;
  const poke = (): void => {
    const w = wake;
    wake = undefined;
    w?.();
  };
  const offer = (host: string): void => {
    if (over || seen.has(host)) return;
    seen.add(host);
    queue.push(host);
    poke();
  };
  const sourceDone = (): void => {
    sourcesLeft -= 1;
    poke();
  };
  Promise.resolve()
    .then(() => t.mdnsBrowse(SERVICE_TYPE, browseMs, (s) => offer(s.host)))
    .catch(() => undefined)
    .then(sourceDone);
  Promise.resolve()
    .then(() =>
      t.probe(
        [REMOTE_PORT],
        probeMs,
        (host) => offer(host),
        () => over,
      ),
    )
    .catch(() => undefined)
    .then(sourceDone);

  const matches = (host: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => done(false), checkMs);
      function done(ok: boolean): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      }
      t.openStream(host, REMOTE_PORT, checkMs, {
        identity: link.certRef,
        pinSha256: link.pinSha256,
      }).then(
        (s) => {
          s.close();
          done(true);
        },
        () => done(false),
      );
    });

  const search = async (): Promise<string | null> => {
    let checks = 0;
    let ownDone = false;
    for (;;) {
      if (over || checks >= max) return null;
      let host = queue.shift();
      if (host === undefined) {
        if (sourcesLeft > 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }
        if (ownDone) return null;
        ownDone = true;
        host = link.host;
      }
      checks += 1;
      if (await matches(host)) return host;
    }
  };

  let giveUp: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      search(),
      new Promise<null>((resolve) => {
        giveUp = setTimeout(() => resolve(null), giveUpMs);
      }),
    ]);
  } finally {
    over = true;
    if (giveUp) clearTimeout(giveUp);
    poke();
  }
}
