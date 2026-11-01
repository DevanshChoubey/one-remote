import { DeviceError, type TvLink } from '@/core';
import { PairError, type FoundTv, type PairedTv, type PairPrompts } from '@/core/tvSetup';
import type { TvSecretsWithDelete, TvTransport } from '@/tv/transport';
import { SamsungClient } from './client';
import { fetchInfo } from './info';

type SamsungLink = Extract<TvLink, { kind: 'samsung' }>;

const CONNECT_MS = 3000;

function newRef(): string {
  return `samsung:${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Pairs with a Samsung TV: reads the info page, opens the wss socket trusting its certificate on
 *  first use, waits for the TV's Allow, and stores the token under `tokenRef`. The certificate's
 *  SHA-256 goes on the link as `pinSha256`. */
export async function pairSamsung(
  t: TvTransport,
  secrets: TvSecretsWithDelete,
  tv: FoundTv,
  prompts: Pick<PairPrompts, 'onAllow'>,
  opts: { reuse?: SamsungLink; promptMs?: number; allowDelayMs?: number } = {},
): Promise<PairedTv & { link: SamsungLink }> {
  const promptMs = opts.promptMs ?? 60000;
  const allowDelayMs = opts.allowDelayMs ?? 400;

  let info;
  try {
    info = await fetchInfo(t, tv.host);
  } catch (e) {
    if (e instanceof DeviceError && e.code === 'notLocal') throw e;
    throw new PairError('unreachable', e instanceof Error ? e.message : String(e));
  }

  let client: SamsungClient;
  try {
    client = await SamsungClient.connect(t, { host: tv.host, pairing: true }, CONNECT_MS);
  } catch (e) {
    if (e instanceof DeviceError && e.code === 'notLocal') throw e;
    throw new PairError('unreachable', e instanceof Error ? e.message : String(e));
  }

  let allowTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cert = client.certSha256;
    if (!cert) throw new PairError('unreachable', 'The TV showed no certificate');
    let answered = false;
    // A TV set to allow all answers at once and never shows the prompt.
    allowTimer = setTimeout(() => {
      if (!answered) prompts.onAllow();
    }, allowDelayMs);
    let token: string;
    try {
      token = await client.ready(promptMs);
    } catch (e) {
      if (e instanceof DeviceError && e.code === 'notPaired') throw new PairError('denied');
      if (e instanceof DeviceError && e.code === 'timeout') throw new PairError('timeout');
      throw new PairError('unreachable');
    } finally {
      answered = true;
    }
    const ref = opts.reuse?.tokenRef ?? newRef();
    try {
      await secrets.set(ref, token);
    } catch {
      throw new PairError('unreachable', 'The token could not be kept');
    }
    return {
      link: {
        kind: 'samsung',
        host: tv.host,
        ...(info.mac ? { mac: info.mac } : {}),
        tokenRef: ref,
        pinSha256: cert,
      },
      suggestedName: info.name,
    };
  } finally {
    clearTimeout(allowTimer);
    client.close();
  }
}
