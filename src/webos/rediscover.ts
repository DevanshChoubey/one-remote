import type { Link, Unsubscribe } from '@/core';
import type { FoundTv } from '@/core/tvSetup';
import { SsapClient } from './client';
import { discoverTvs } from './discovery';
import { parseMac, URI } from './ssap';
import type { TvSecrets, TvTransport } from './transport';

const CHECK_MS = 1500;
const GIVE_UP_MS = 20000;
/** How long a candidate without the stored USN waits for one that has it. */
const USN_GRACE_MS = 1000;

/**
 * Finds the TV again after its address changed. Candidates come from SSDP and the subnet probe,
 * a USN equal to the stored one first. For at most `maxCandidates` it registers with the stored
 * key: a prompt instead of `registered` means another TV (skipped), and a candidate is accepted
 * only when its MAC equals `link.mac`. Returns the new host, or null.
 */
export async function rediscover(
  t: TvTransport,
  secrets: Pick<TvSecrets, 'get'>,
  link: Extract<Link, { kind: 'webos' }>,
  opts: { maxCandidates?: number } = {},
): Promise<string | null> {
  const max = opts.maxCandidates ?? 3;
  if (!link.mac) return null;
  const wantMac = link.mac.toLowerCase();
  const [key, storedUsn] = await Promise.all([
    secrets.get(link.clientKeyRef),
    secrets.get(`${link.clientKeyRef}:usn`),
  ]);
  if (!key) return null;

  const isSameTv = async (tv: FoundTv): Promise<boolean> => {
    let client: SsapClient | undefined;
    try {
      client = await SsapClient.connect(
        t,
        { host: tv.host, secure: tv.secure || link.secure },
        CHECK_MS,
      );
      const open = client;
      let prompted = false;
      await open.register(
        key,
        () => {
          prompted = true;
          open.close();
        },
        CHECK_MS,
      );
      if (prompted) return false;
      return parseMac(await open.request(URI.netInfo, undefined, CHECK_MS)) === wantMac;
    } catch {
      return false;
    } finally {
      client?.close();
    }
  };

  return new Promise<string | null>((resolve) => {
    const queue: FoundTv[] = [];
    let tried = 0;
    let busy = false;
    let discoveryDone = false;
    let graceOver = !storedUsn;
    let finished = false;
    let stop: Unsubscribe | undefined;

    const finish = (host: string | null): void => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      clearTimeout(grace);
      stop?.();
      resolve(host);
    };
    const guard = setTimeout(() => finish(null), GIVE_UP_MS);
    const grace = storedUsn
      ? setTimeout(() => {
          graceOver = true;
          void pump();
        }, USN_GRACE_MS)
      : undefined;

    const pump = async (): Promise<void> => {
      if (busy || finished) return;
      busy = true;
      while (!finished && tried < max && queue.length > 0) {
        const preferred = storedUsn ? queue.findIndex((c) => c.usn === storedUsn) : -1;
        if (preferred < 0 && !graceOver) break;
        const [tv] = queue.splice(Math.max(0, preferred), 1);
        tried += 1;
        if (tv && (await isSameTv(tv))) {
          finish(tv.host);
          return;
        }
      }
      busy = false;
      if (!finished && (tried >= max || (discoveryDone && queue.length === 0))) finish(null);
    };

    stop = discoverTvs(
      t,
      (tv) => {
        queue.push(tv);
        void pump();
      },
      {
        onDone: () => {
          discoveryDone = true;
          graceOver = true;
          void pump();
        },
      },
    );
  });
}
