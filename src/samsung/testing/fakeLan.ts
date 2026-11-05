import { DeviceError } from '@/core';
import type {
  TvHttpResponse,
  TvIdentity,
  TvSocket,
  TvStream,
  TvTls,
  TvTransport,
} from '@/tv/transport';
import { INFO_PORT, WSS_PORT } from '../url';
import type { FakeSamsungTv } from './fakeTv';

export interface FakeSamsungLan extends TvTransport {
  wol: Uint8Array[];
  /** Every URL passed to `open`, in order. */
  opened: string[];
  /** The `ports` of every `probe`, in order. */
  probes: number[][];
  /** What `onWifi()` answers. */
  onWifiResult: boolean;
}

/** A fake LAN of Samsung TVs. Like the real transport, a `wss://` open needs `pairing` or the TV's
 *  pinned certificate, else it rejects `notPaired`. `openStream`, `mdnsBrowse` and the identity
 *  members are not used by Samsung and reject `unsupported`. */
export function createFakeSamsungLan(tvs: FakeSamsungTv[]): FakeSamsungLan {
  const lan: FakeSamsungLan = {
    wol: [],
    opened: [],
    probes: [],
    onWifiResult: true,
    open(url: string, _timeoutMs: number, tls?: TvTls): Promise<TvSocket> {
      lan.opened.push(url);
      if (url.startsWith('wss:') && !tls?.pinSha256 && !tls?.pairing) {
        return Promise.reject(new DeviceError('notPaired', `No pinned certificate for ${url}`));
      }
      const tv = tvs.find((t) => t.isUp() && t.matches(url));
      if (!tv) return Promise.reject(new DeviceError('notSent', `cannot open ${url}`));
      if (tls?.pinSha256 && tls.pinSha256 !== tv.certSha256) {
        return Promise.reject(
          new DeviceError('notPaired', `cannot open ${url}: certificate does not match the pin`),
        );
      }
      const sock = tv.connect(url);
      if (!sock) return Promise.reject(new DeviceError('notSent', `cannot open ${url}`));
      return Promise.resolve(Object.assign(sock, { certSha256: tv.certSha256 }));
    },
    request(req): Promise<TvHttpResponse> {
      const m = /^http:\/\/([^/:]+):(\d+)\/api\/v2\/?$/.exec(req.url);
      const tv = m && tvs.find((t) => t.host === m[1]);
      if (!m || !tv || m[2] !== String(INFO_PORT) || req.method !== 'GET') {
        return Promise.reject(new DeviceError('notSent', `cannot request ${req.url}`));
      }
      const body = tv.infoBody();
      if (body === null)
        return Promise.reject(new DeviceError('notSent', `no answer from ${tv.host}`));
      return Promise.resolve({ status: 200, headers: {}, body });
    },
    ssdpSearch(_message, windowMs, onReply): Promise<void> {
      for (const tv of tvs) {
        const text = tv.ssdpReply();
        if (text) void Promise.resolve().then(() => onReply(text, tv.host));
      }
      return new Promise((resolve) => setTimeout(resolve, windowMs));
    },
    probe(ports, perHostMs, onOpen, isCancelled, onHost): Promise<void> {
      lan.probes.push([...ports]);
      if (!isCancelled?.()) {
        for (const tv of tvs) {
          if (!tv.isUp()) continue;
          const open = [INFO_PORT, WSS_PORT].filter((p) => ports.includes(p));
          if (open.length === 0) continue;
          void Promise.resolve().then(() => {
            open.forEach((p) => onOpen(tv.host, p));
            onHost?.(tv.host, open);
          });
        }
      }
      return new Promise((resolve) => setTimeout(resolve, perHostMs));
    },
    sendWol(packet): Promise<void> {
      lan.wol.push(packet);
      return Promise.resolve();
    },
    onWifi: () => Promise.resolve(lan.onWifiResult),
    openStream(host, port): Promise<TvStream> {
      return Promise.reject(new DeviceError('unsupported', `no stream to ${host}:${String(port)}`));
    },
    mdnsBrowse(): Promise<void> {
      return Promise.reject(new DeviceError('unsupported', 'no mDNS'));
    },
    ensureIdentity(): Promise<TvIdentity> {
      return Promise.reject(new DeviceError('unsupported', 'no client identity'));
    },
    deleteIdentity(): Promise<void> {
      return Promise.reject(new DeviceError('unsupported', 'no client identity'));
    },
  };
  return lan;
}
