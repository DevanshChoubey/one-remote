import type {
  Device,
  FoundTv,
  PairedTv,
  PairPrompts,
  TvLink,
  TvLinkKind,
  Unsubscribe,
} from '@/core';

/** One TV brand's part of the Add TV flow. Each lane writes one and adds it to the registry in
 *  `createServices`; the composite in `src/tv/setup.ts` runs them together. */
export interface BrandSetup {
  kind: TvLinkKind;
  /** i18n key of the brand word shown in the brand list and under a found TV, e.g. 'addTv.brandLg'. */
  labelKey: string;
  pairing: 'allow' | 'code';
  /** Ports the shared subnet probe sweeps for this brand. */
  probePorts: number[];
  /** Multicast discovery only (SSDP / mDNS). Best effort; ends quietly on error. */
  discover(onFound: (tv: FoundTv) => void): Unsubscribe;
  /** Turns one host's open probe ports (only this brand's) into a TV, or null. */
  fromProbe(host: string, open: ReadonlySet<number>): FoundTv | null;
  probeHost(host: string): Promise<FoundTv | null>;
  pair(tv: FoundTv, prompts: PairPrompts, reuse?: TvLink): Promise<PairedTv>;
  /** New host for this brand's link, or null. */
  findAgain(device: Device, link: TvLink): Promise<string | null>;
}
