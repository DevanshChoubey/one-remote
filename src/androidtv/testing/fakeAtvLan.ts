import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { DeviceError } from '@/core';
import type { TvIdentity, TvStream, TvTls } from '@/tv/transport';
import type { AtvTransport } from '../constants';
import type { RsaPublic } from '../secret';
import type { FakeAtv } from './fakeAtv';

export type FakeAtvLan = AtvTransport & {
  wifi: boolean;
  mdnsEnabled: boolean;
  readonly wolPackets: Uint8Array[];
  /** Every `openStream` call, in order. */
  readonly streams: { host: string; port: number; tls: TvTls & { identity?: string } }[];
  /** Ref to its current identity. */
  readonly identities: Map<string, RsaPublic>;
  /** Every `deleteIdentity` ref, in order. */
  readonly deleted: string[];
};

/** A fake LAN for Android TVs. `openStream` routes by host and port, rejects `notSent` for unknown
 *  hosts and without Wi-Fi at once, and for `hang` hosts after `timeoutMs`. Like the real
 *  transport, it needs `pairing` or a pin (else `notPaired`), and a pin must be the TV's certificate. */
export function createFakeAtvLan(o: {
  tvs: FakeAtv[];
  wifi?: boolean;
  hang?: string[];
}): FakeAtvLan {
  const wolPackets: Uint8Array[] = [];
  const streams: FakeAtvLan['streams'] = [];
  const identities = new Map<string, RsaPublic>();
  const deleted: string[] = [];
  const generation = new Map<string, number>();
  const hang = o.hang ?? [];
  const reject = <T>(what: string): Promise<T> =>
    Promise.reject(new DeviceError('notSent', `cannot ${what}`));

  const lan = {
    wifi: o.wifi ?? true,
    mdnsEnabled: true,
    wolPackets,
    streams,
    identities,
    deleted,
    openStream(host, port, timeoutMs, tls): Promise<TvStream> {
      streams.push({ host, port, tls });
      if (!tls.pinSha256 && !tls.pairing) {
        return Promise.reject(new DeviceError('notPaired', `No pinned certificate for ${host}`));
      }
      if (!lan.wifi) return reject('open: not on Wi-Fi');
      if (hang.includes(host)) {
        return new Promise<TvStream>((_resolve, rej) => {
          setTimeout(
            () => rej(new DeviceError('notSent', `timed out opening ${host}:${String(port)}`)),
            timeoutMs,
          );
        });
      }
      const tv = o.tvs.find((t) => t.host === host);
      if ((port !== 6466 && port !== 6467) || !tv || !tv.isUp()) {
        return reject(`open ${host}:${String(port)}`);
      }
      let client: RsaPublic | undefined;
      if (tls.identity !== undefined) {
        client = identities.get(tls.identity);
        if (!client) return reject(`open: no client identity '${tls.identity}'`);
      }
      if (tls.pinSha256 && tls.pinSha256 !== tv.certSha256) {
        return Promise.reject(
          new DeviceError('notPaired', `certificate of ${host} does not match the pin`),
        );
      }
      try {
        return Promise.resolve(tv.connect(port, client));
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    },
    ensureIdentity(ref, _commonName): Promise<TvIdentity> {
      let id = identities.get(ref);
      if (!id) {
        const gen = generation.get(ref) ?? 0;
        const modulusHex = bytesToHex(sha256(`${ref}#${String(gen)}`))
          .toUpperCase()
          .replace(/^0+/, '');
        id = { modulusHex, exponentHex: '10001' };
        identities.set(ref, id);
      }
      return Promise.resolve(id);
    },
    deleteIdentity(ref): Promise<void> {
      deleted.push(ref);
      identities.delete(ref);
      generation.set(ref, (generation.get(ref) ?? 0) + 1);
      return Promise.resolve();
    },
    mdnsBrowse(_type, windowMs, onService): Promise<void> {
      if (lan.mdnsEnabled && lan.wifi) {
        for (const tv of o.tvs) {
          if (!tv.isUp() || hang.includes(tv.host)) continue;
          void Promise.resolve().then(() =>
            onService({ name: tv.name, host: tv.host, port: 6466, txt: {} }),
          );
        }
      }
      return new Promise((resolve) => setTimeout(resolve, windowMs));
    },
    probe(ports, perHostMs, onOpen, isCancelled, onHost): Promise<void> {
      if (isCancelled?.()) return Promise.resolve();
      for (const tv of lan.wifi ? o.tvs : []) {
        if (!tv.isUp() || hang.includes(tv.host)) continue;
        const open = [6466, 6467].filter((p) => ports.includes(p));
        if (open.length === 0) continue;
        void Promise.resolve().then(() => {
          open.forEach((p) => onOpen(tv.host, p));
          onHost?.(tv.host, open);
        });
      }
      return new Promise((resolve) => setTimeout(resolve, perHostMs));
    },
    sendWol(packet): Promise<void> {
      wolPackets.push(packet);
      return Promise.resolve();
    },
    onWifi: () => Promise.resolve(lan.wifi),
  } as FakeAtvLan;
  return lan;
}
