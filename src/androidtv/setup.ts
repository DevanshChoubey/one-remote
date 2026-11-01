import type { FoundTv, PairedTv, PairPrompts, TvLink } from '@/core';
import type { BrandSetup } from '@/tv/brands';
import { REMOTE_PORT, type AtvTransport } from './constants';
import { androidTvFromProbe, discoverAndroidTvs, probeAndroidTv } from './discovery';
import { pairAndroidTv } from './pair';
import { findAndroidTvByPin } from './rediscover';

/** The Google TV / Android TV part of the Add TV flow. Builds without touching the network. */
export function createAndroidTvBrand(o: { transport: AtvTransport }): BrandSetup {
  const t = o.transport;
  return {
    kind: 'androidtv',
    labelKey: 'addTv.brandAndroidTv',
    pairing: 'code',
    probePorts: [REMOTE_PORT],
    discover: (onFound) => discoverAndroidTvs(t, onFound),
    fromProbe: androidTvFromProbe,
    probeHost: (host) => probeAndroidTv(t, host),
    pair: (tv: FoundTv, prompts: PairPrompts, reuse?: TvLink): Promise<PairedTv> =>
      pairAndroidTv(t, tv, prompts, { reuse }),
    async findAgain(_device, link) {
      return link.kind === 'androidtv' ? findAndroidTvByPin(t, link) : null;
    },
  };
}
