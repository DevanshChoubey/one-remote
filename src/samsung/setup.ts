import type { FoundTv, PairedTv, PairPrompts, TvLink } from '@/core';
import type { BrandSetup } from '@/tv/brands';
import type { TvSecretsWithDelete, TvTransport } from '@/tv/transport';
import { discoverSsdp, probeSamsungHost, samsungFromProbe } from './discovery';
import { pairSamsung } from './pair';
import { rediscoverSamsung } from './rediscover';
import { INFO_PORT, WSS_PORT } from './url';

/** The Samsung Tizen part of the Add TV flow. Builds without touching the network. */
export function createSamsungBrand(o: {
  transport: TvTransport;
  secrets: TvSecretsWithDelete;
}): BrandSetup {
  const { transport, secrets } = o;
  return {
    kind: 'samsung',
    labelKey: 'addTv.brandSamsung',
    pairing: 'allow',
    probePorts: [INFO_PORT, WSS_PORT],
    discover: (onFound) => discoverSsdp(transport, onFound),
    fromProbe: samsungFromProbe,
    probeHost: (host: string) => probeSamsungHost(transport, host),
    pair: (tv: FoundTv, prompts: PairPrompts, reuse?: TvLink): Promise<PairedTv> =>
      pairSamsung(transport, secrets, tv, prompts, {
        ...(reuse?.kind === 'samsung' ? { reuse } : {}),
      }),
    async findAgain(_device, link) {
      if (link.kind !== 'samsung') return null;
      const token = await secrets.get(link.tokenRef);
      if (token === null) return null;
      return rediscoverSamsung(transport, link, token ? { token } : {});
    },
  };
}
