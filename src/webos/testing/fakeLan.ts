import { DeviceError } from '@/core';
import type {
  TvHttpResponse,
  TvIdentity,
  TvSocket,
  TvStream,
  TvTls,
  TvTransport,
} from '@/tv/transport';
import type { FakeTv } from './fakeTv';

export type FakeLan = TvTransport & {
  wolPackets: Uint8Array[];
  /** Every URL passed to `open`, in order. */
  opened: string[];
  /** The TLS options of every `open`, in order (undefined when none were given). */
  tlsOpened: (TvTls | undefined)[];
  ssdpEnabled: boolean;
  wifi: boolean;
};

function hostOf(url: string): string {
  return /^wss?:\/\/([^/:]+)/.exec(url)?.[1] ?? '';
}

/** A fake LAN. `open` routes by host, rejects `notSent` for unknown hosts at once and for `hang`
 *  hosts after `timeoutMs`. Like the real transport, a `wss://` open needs `pairing` or the TV's
 *  pinned certificate, else it rejects `notPaired`; it reports the TV's `certSha256`.
 *  `openStream` rejects `notSent`: no fake TV speaks a raw TLS stream. */
export function createFakeLan(opts: { tvs: FakeTv[]; wifi?: boolean; hang?: string[] }): FakeLan {
  const wolPackets: Uint8Array[] = [];
  const opened: string[] = [];
  const tlsOpened: (TvTls | undefined)[] = [];
  const hang = opts.hang ?? [];

  const lan: FakeLan = {
    wolPackets,
    opened,
    tlsOpened,
    ssdpEnabled: true,
    wifi: opts.wifi ?? true,
    open(url: string, timeoutMs: number, tls?: TvTls): Promise<TvSocket> {
      opened.push(url);
      tlsOpened.push(tls);
      const secure = url.startsWith('wss:');
      if (secure && !tls?.pinSha256 && !tls?.pairing) {
        return Promise.reject(new DeviceError('notPaired', `No pinned certificate for ${url}`));
      }
      if (!lan.wifi) return Promise.reject(new DeviceError('notSent', 'not on Wi-Fi'));
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
        if (!sock) continue;
        if (!secure) return Promise.resolve(sock);
        if (tls?.pinSha256 && tls.pinSha256 !== tv.certSha256) {
          sock.close();
          return Promise.reject(
            new DeviceError('notPaired', `cannot open ${url}: certificate does not match the pin`),
          );
        }
        return Promise.resolve(Object.assign(sock, { certSha256: tv.certSha256 }));
      }
      return Promise.reject(new DeviceError('notSent', `cannot open ${url}`));
    },
    openStream(host, port): Promise<TvStream> {
      return Promise.reject(new DeviceError('notSent', `cannot open ${host}:${String(port)}`));
    },
    ensureIdentity(ref): Promise<TvIdentity> {
      return Promise.reject(new DeviceError('notSent', `no client identity '${ref}'`));
    },
    deleteIdentity(): Promise<void> {
      return Promise.resolve();
    },
    request(req): Promise<TvHttpResponse> {
      return Promise.reject(new DeviceError('notSent', `cannot request ${req.url}`));
    },
    ssdpSearch(_message, windowMs, onReply): Promise<void> {
      if (lan.ssdpEnabled && lan.wifi) {
        for (const tv of opts.tvs) {
          const text = hang.includes(tv.host) ? null : tv.ssdpReply();
          if (text) void Promise.resolve().then(() => onReply(text, tv.host));
        }
      }
      return new Promise((resolve) => setTimeout(resolve, windowMs));
    },
    mdnsBrowse(_serviceType, windowMs): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, windowMs));
    },
    probe(ports, perHostMs, onOpen, isCancelled): Promise<void> {
      if (isCancelled?.()) return Promise.resolve();
      for (const tv of lan.wifi ? opts.tvs : []) {
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
