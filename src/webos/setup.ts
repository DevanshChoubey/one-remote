import type { FoundTv, PairedTv, PairPrompts, TvLink } from '@/core';
import type { BrandSetup } from '@/tv/brands';
import type { TvSecretsWithDelete, TvTransport } from '@/tv/transport';
import { probeHost, ssdpDiscover } from './discovery';
import { pairTv } from './pair';
import { rediscover } from './rediscover';

/** The LG webOS part of the Add TV flow. Builds without touching the network. */
export function createWebosBrand(o: {
  transport: TvTransport;
  secrets: TvSecretsWithDelete;
}): BrandSetup {
  const { transport, secrets } = o;
  return {
    kind: 'webos',
    labelKey: 'addTv.brandLg',
    pairing: 'allow',
    probePorts: [3000, 3001],
    discover: (onFound) => ssdpDiscover(transport, onFound, 3000),
    fromProbe(host: string, open: ReadonlySet<number>): FoundTv | null {
      if (open.has(3000)) return { kind: 'webos', host, name: 'LG TV', secure: false };
      if (open.has(3001)) return { kind: 'webos', host, name: 'LG TV', secure: true };
      return null;
    },
    probeHost: (host: string) => probeHost(transport, host),
    pair: (tv: FoundTv, prompts: PairPrompts, reuse?: TvLink): Promise<PairedTv> =>
      pairTv(transport, secrets, tv, prompts, reuse),
    async findAgain(_device, link) {
      return link.kind === 'webos' ? rediscover(transport, secrets, link) : null;
    },
  };
}
