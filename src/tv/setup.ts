import {
  DeviceError,
  PairError,
  tvLinkOf,
  type Device,
  type FoundTv,
  type PairedTv,
  type PairPrompts,
  type TvFrame,
  type TvLink,
  type TvSetup,
  type Unsubscribe,
} from '@/core';
import type { BrandSetup } from './brands';
import type { TvTransport } from './transport';

/** One search across every brand: each brand's multicast discovery plus a single subnet probe.
 *  Registry order is priority when two brands claim the same host. */
export function createCompositeTvSetup(o: {
  brands: BrandSetup[];
  transport: Pick<TvTransport, 'probe'>;
  probeMs?: number;
  frames?: { subscribe(cb: (f: TvFrame) => void): Unsubscribe };
}): TvSetup {
  const { brands, transport, frames } = o;
  const probeMs = o.probeMs ?? 1500;
  const rank = (kind: string): number => {
    const i = brands.findIndex((b) => b.kind === kind);
    return i < 0 ? Infinity : i;
  };

  return {
    discover(onFound: (tv: FoundTv) => void): Unsubscribe {
      let stopped = false;
      const seen = new Map<string, FoundTv>();
      const emit = (tv: FoundTv): void => {
        if (stopped) return;
        const prev = seen.get(tv.host);
        let upgrade = false;
        if (prev) {
          const earlier = rank(tv.kind) < rank(prev.kind);
          upgrade = tv.kind === prev.kind && tv.secure && !prev.secure;
          if (!earlier && !upgrade) return;
        }
        // An upgrade keeps what discovery already learned (SSDP friendly name, usn).
        const out = upgrade && prev ? { ...tv, ...prev, secure: tv.secure } : tv;
        seen.set(tv.host, out);
        onFound(out);
      };

      const stops: Unsubscribe[] = [];
      for (const brand of brands) {
        try {
          stops.push(brand.discover(emit));
        } catch {
          // best effort: one brand failing never stops the others
        }
      }

      const ports = [...new Set(brands.flatMap((b) => b.probePorts))];
      const fromHost = (host: string, openPorts: number[]): void => {
        const hostPorts = new Set(openPorts);
        for (const brand of brands) {
          if (stopped) return;
          const own = new Set(brand.probePorts.filter((p) => hostPorts.has(p)));
          if (own.size === 0) continue;
          try {
            const tv = brand.fromProbe(host, own);
            if (tv) emit(tv);
          } catch {
            // one brand misreading a host never hides the others
          }
        }
      };
      Promise.resolve()
        .then(() =>
          transport.probe(
            ports,
            probeMs,
            () => undefined,
            () => stopped,
            fromHost,
          ),
        )
        .catch(() => undefined);

      return () => {
        stopped = true;
        for (const stop of stops) {
          try {
            stop();
          } catch {
            // one brand failing to stop never keeps the others running
          }
        }
      };
    },

    async probeHost(host: string): Promise<FoundTv | null> {
      for (const brand of brands) {
        try {
          const tv = await brand.probeHost(host);
          if (tv) return tv;
        } catch (e) {
          // Any error but notLocal means "not this brand" (as the old LG probeHost did).
          if (e instanceof DeviceError && e.code === 'notLocal') throw e;
        }
      }
      return null;
    },

    pair(tv: FoundTv, prompts: PairPrompts, reuse?: TvLink): Promise<PairedTv> {
      const brand = brands.find((b) => b.kind === tv.kind);
      if (!brand) return Promise.reject(new PairError('unreachable', `no ${tv.kind} support`));
      return brand.pair(tv, prompts, reuse);
    },

    async findAgain(device: Device): Promise<string | null> {
      const link = tvLinkOf(device);
      const brand = link && brands.find((b) => b.kind === link.kind);
      return link && brand ? brand.findAgain(device, link) : null;
    },

    ...(frames ? { onFrame: (cb: (f: TvFrame) => void) => frames.subscribe(cb) } : {}),
  };
}
