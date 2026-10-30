import { DeviceError } from '@/core';
import type { FakeTv } from './fakeTv';
import type { TvSocket, TvTransport } from '../transport';

export type FakeLan = TvTransport & {
  wolPackets: Uint8Array[];
  /** Every URL passed to `open`, in order. */
  opened: string[];
  ssdpEnabled: boolean;
  wifi: boolean;
};

function hostOf(url: string): string {
  return /^wss?:\/\/([^/:]+)/.exec(url)?.[1] ?? '';
}

/** A fake LAN. `open` routes by host, rejects `notSent` for unknown hosts at once and for `hang`
 *  hosts after `timeoutMs`. */
export function createFakeLan(opts: { tvs: FakeTv[]; wifi?: boolean; hang?: string[] }): FakeLan {
  const wolPackets: Uint8Array[] = [];
  const opened: string[] = [];
  const hang = opts.hang ?? [];

  const lan: FakeLan = {
    wolPackets,
    opened,
    ssdpEnabled: true,
    wifi: opts.wifi ?? true,
    open(url: string, timeoutMs: number): Promise<TvSocket> {
      opened.push(url);
      const host = hostOf(url);
      if (hang.includes(host)) {
        return new Promise<TvSocket>((_resolve, reject) => {
          setTimeout(
            () => reject(new DeviceError('notSent', `timed out opening ${url}`)),
            timeoutMs,
          );
        });
      }
      for (const tv of opts.tvs) {
        const sock = tv.connect(url);
        if (sock) return Promise.resolve(sock);
      }
      return Promise.reject(new DeviceError('notSent', `cannot open ${url}`));
    },
    ssdpSearch(_message, windowMs, onReply): Promise<void> {
      if (lan.ssdpEnabled) {
        for (const tv of opts.tvs) {
          const text = hang.includes(tv.host) ? null : tv.ssdpReply();
          if (text) void Promise.resolve().then(() => onReply(text, tv.host));
        }
      }
      return new Promise((resolve) => setTimeout(resolve, windowMs));
    },
    probe(ports, perHostMs, onOpen): Promise<void> {
      for (const tv of opts.tvs) {
        if (!tv.isUp() || hang.includes(tv.host)) continue;
        const port = tv.port();
        if (ports.includes(port)) void Promise.resolve().then(() => onOpen(tv.host, port));
      }
      return new Promise((resolve) => setTimeout(resolve, perHostMs));
    },
    sendWol(packet): Promise<void> {
      wolPackets.push(packet);
      return Promise.resolve();
    },
    onWifi: () => Promise.resolve(lan.wifi),
  };
  return lan;
}
