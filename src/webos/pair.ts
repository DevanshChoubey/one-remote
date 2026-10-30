import { DeviceError } from '@/core';
import { PairError, type FoundTv, type PairedTv } from '@/core/tvSetup';
import { SsapClient } from './client';
import { parseMac, URI } from './ssap';
import type { TvSecrets, TvTransport } from './transport';

const CONNECT_MS = 3000;
const PROMPT_MS = 60000;

function newRef(): string {
  return `webos:${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Pairs with a TV: shows the prompt on the TV, stores the client key (and the USN) in secrets. Over
 *  `wss://` the TV's certificate is trusted on first use and its SHA-256 stored under
 *  `${clientKeyRef}:cert`; every later connect accepts only that certificate. */
export async function pairTv(
  t: TvTransport,
  secrets: TvSecrets,
  tv: FoundTv,
  onPrompt: () => void,
  opts: { clientKeyRef?: string; promptMs?: number } = {},
): Promise<PairedTv> {
  let client: SsapClient | undefined;
  let secure = tv.secure;
  const failures: string[] = [];
  // SSDP cannot say which port a TV uses: when ws:3000 is refused, try wss:3001.
  for (const tryWss of tv.secure ? [true] : [false, true]) {
    try {
      client = await SsapClient.connect(
        t,
        { host: tv.host, secure: tryWss, pairing: true },
        CONNECT_MS,
      );
      secure = tryWss;
      break;
    } catch (e) {
      if (e instanceof DeviceError && e.code === 'notLocal') throw e;
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!client) throw new PairError('unreachable', failures.join('; '));
  const cert = secure ? client.certSha256 : undefined;
  try {
    // Without the certificate there is nothing to pin, so the TV could not be reached again.
    if (secure && !cert) throw new PairError('unreachable', 'The TV showed no certificate');
    let key: string;
    try {
      key = await client.register(undefined, onPrompt, opts.promptMs ?? PROMPT_MS);
    } catch (e) {
      if (e instanceof DeviceError && e.code === 'timeout') throw new PairError('timeout');
      if (e instanceof DeviceError && e.code === 'notPaired') throw new PairError('denied');
      throw new PairError('unreachable');
    }
    const ref = opts.clientKeyRef ?? newRef();
    try {
      await secrets.set(ref, key);
      if (tv.usn) await secrets.set(`${ref}:usn`, tv.usn);
      if (cert) await secrets.set(`${ref}:cert`, cert);
    } catch {
      // The key could not be kept: pairing did not complete.
      throw new PairError('unreachable');
    }
    let mac: string | undefined;
    try {
      mac = parseMac(await client.request(URI.netInfo));
    } catch {
      mac = undefined;
    }
    return {
      link: {
        kind: 'webos',
        host: tv.host,
        ...(mac ? { mac } : {}),
        secure,
        clientKeyRef: ref,
      },
      suggestedName: tv.name.replace(/^\[LG\]\s*/, '').trim() || 'LG TV',
    };
  } finally {
    client.close();
  }
}
