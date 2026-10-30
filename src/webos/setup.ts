import type { Device, FoundTv, PairedTv, TvSetup, Unsubscribe } from '@/core';
import { discoverTvs, probeHost } from './discovery';
import type { FrameTap } from './frameTap';
import { pairTv } from './pair';
import { rediscover } from './rediscover';
import type { TvSecrets, TvTransport } from './transport';

/** The Add TV flow's view of the webOS code. Builds without touching the network. */
export function createTvSetup(o: {
  transport: TvTransport;
  secrets: TvSecrets;
  /** Dev-only: exposes the frame log as `onFrame`. */
  frames?: FrameTap;
}): TvSetup {
  const { transport, secrets } = o;
  const frames = o.frames;
  return {
    discover: (onFound: (tv: FoundTv) => void): Unsubscribe => discoverTvs(transport, onFound),
    probeHost: (host: string): Promise<FoundTv | null> => probeHost(transport, host),
    pair: (tv: FoundTv, onPrompt: () => void, clientKeyRef?: string): Promise<PairedTv> =>
      pairTv(transport, secrets, tv, onPrompt, clientKeyRef ? { clientKeyRef } : {}),
    async findAgain(device: Device): Promise<string | null> {
      const link = device.links.find((l) => l.kind === 'webos');
      if (!link || link.kind !== 'webos') return null;
      return rediscover(transport, secrets, link);
    },
    ...(frames ? { onFrame: (cb) => frames.subscribe(cb) } : {}),
  };
}
