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

/** Pairs with a TV: shows the prompt on the TV, stores the client key (and the USN) in secrets. */
export async function pairTv(
  t: TvTransport,
  secrets: TvSecrets,
  tv: FoundTv,
  onPrompt: () => void,
  opts: { clientKeyRef?: string; promptMs?: number } = {},
): Promise<PairedTv> {
  let client: SsapClient;
  try {
    client = await SsapClient.connect(t, tv, CONNECT_MS);
  } catch (e) {
    if (e instanceof DeviceError && e.code === 'notLocal') throw e;
    throw new PairError('unreachable');
  }
  try {
    let key: string;
    try {
      key = await client.register(undefined, onPrompt, opts.promptMs ?? PROMPT_MS);
    } catch (e) {
      if (e instanceof DeviceError && e.code === 'timeout') throw new PairError('timeout');
      if (e instanceof DeviceError && e.code === 'notPaired') throw new PairError('denied');
      throw new PairError('unreachable');
    }
    const ref = opts.clientKeyRef ?? newRef();
    await secrets.set(ref, key);
    if (tv.usn) await secrets.set(`${ref}:usn`, tv.usn);
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
        secure: tv.secure,
        clientKeyRef: ref,
      },
      suggestedName: tv.name.replace(/^\[LG\]\s*/, '').trim() || 'LG TV',
    };
  } finally {
    client.close();
  }
}
