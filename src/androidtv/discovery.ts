import { DeviceError, type FoundTv, type Unsubscribe } from '@/core';
import {
  CERT_REF,
  DEFAULT_NAME,
  PAIR_PORT,
  REMOTE_PORT,
  SERVICE_TYPE,
  type AtvTransport,
} from './constants';

/** mDNS only (`_androidtvremote2._tcp`). Best effort: a browse error ends quietly. Each host is
 *  reported once; nothing is reported after unsubscribe. */
export function discoverAndroidTvs(
  t: Pick<AtvTransport, 'mdnsBrowse'>,
  onFound: (tv: FoundTv) => void,
  opts: { browseMs?: number } = {},
): Unsubscribe {
  let stopped = false;
  const seen = new Set<string>();
  Promise.resolve()
    .then(() =>
      t.mdnsBrowse(SERVICE_TYPE, opts.browseMs ?? 3000, (s) => {
        if (stopped || seen.has(s.host)) return;
        seen.add(s.host);
        onFound({ kind: 'androidtv', host: s.host, name: s.name || DEFAULT_NAME, secure: true });
      }),
    )
    .catch(() => undefined);
  return () => {
    stopped = true;
  };
}

/** A TV from the subnet probe: port 6466 open. */
export function androidTvFromProbe(host: string, open: ReadonlySet<number>): FoundTv | null {
  return open.has(REMOTE_PORT)
    ? { kind: 'androidtv', host, name: DEFAULT_NAME, secure: true }
    : null;
}

/** Looks at one typed address: the pairing port answers TLS with this phone's identity. `notLocal`
 *  is rethrown; any other failure is "not an Android TV". */
export async function probeAndroidTv(
  t: Pick<AtvTransport, 'openStream' | 'ensureIdentity'>,
  host: string,
): Promise<FoundTv | null> {
  try {
    await t.ensureIdentity(CERT_REF, 'One Remote');
    const stream = await t.openStream(host, PAIR_PORT, 1500, { pairing: true, identity: CERT_REF });
    stream.close();
    return { kind: 'androidtv', host, name: DEFAULT_NAME, secure: true };
  } catch (e) {
    if (e instanceof DeviceError && e.code === 'notLocal') throw e;
    return null;
  }
}
