import {
  DeviceError,
  PairError,
  type FoundTv,
  type PairedTv,
  type PairPrompts,
  type TvLink,
} from '@/core';
import type { TvStream } from '@/tv/transport';
import {
  CERT_REF,
  CLIENT_NAME,
  DEFAULT_NAME,
  PAIR_PORT,
  REMOTE_PORT,
  type AtvTransport,
} from './constants';
import { decodePairing, encodePairing, STATUS_OK, type PairingIn } from './messages';
import { FrameReader, frame } from './proto';
import { AtvRemote } from './remote';
import { normaliseCode, pairingSecret } from './secret';

const MAC_RE = /^([0-9a-f]{2})([:-][0-9a-f]{2}){5}$/i;

/** The TV's MAC from its certificate subject: the last `/` part of the CN, when it is a MAC. */
export function macFromSubject(subject: string): string | undefined {
  const cn = /(?:^|,)\s*CN=((?:[^,\\]|\\.)*)/i.exec(subject)?.[1];
  const last = cn?.split('/').pop()?.trim();
  if (!last || !MAC_RE.test(last)) return undefined;
  return last.toLowerCase().replace(/-/g, ':');
}

type Msg = { status: number; msg: PairingIn };

/** The decoded replies of one pairing stream, in order. */
class Channel {
  private readonly queue: Msg[] = [];
  private waiter: ((m: Msg | null) => void) | undefined;
  private readonly reader = new FrameReader();
  closed = false;

  constructor(readonly stream: TvStream) {
    stream.onData((bytes) => {
      let frames: Uint8Array[];
      try {
        frames = this.reader.push(bytes);
      } catch {
        this.end();
        return;
      }
      for (const f of frames) {
        let m: Msg;
        try {
          m = decodePairing(f);
        } catch {
          continue;
        }
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = undefined;
          w(m);
        } else this.queue.push(m);
      }
    });
    stream.onClose(() => this.end());
  }

  private end(): void {
    this.closed = true;
    this.stream.close();
    const w = this.waiter;
    this.waiter = undefined;
    w?.(null);
  }

  send(m: Parameters<typeof encodePairing>[0]): void {
    this.stream.write(frame(encodePairing(m)));
  }

  /** The next reply; null when the stream closed. Rejects `timeout` after `ms`. */
  next(ms: number): Promise<Msg | null> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = undefined;
        reject(new PairError('timeout', 'The TV did not answer'));
      }, ms);
      this.waiter = (m) => {
        clearTimeout(timer);
        resolve(m);
      };
    });
  }

  close(): void {
    this.closed = true;
    this.stream.close();
  }
}

const RETRY_REMOTE_MS = 500;

/** Pairs with an Android TV: the TV shows a code, the user types it. */
export async function pairAndroidTv(
  t: Pick<AtvTransport, 'openStream' | 'ensureIdentity'>,
  tv: FoundTv,
  prompts: PairPrompts,
  opts: { stepMs?: number; connectMs?: number; reuse?: TvLink } = {},
): Promise<PairedTv> {
  const stepMs = opts.stepMs ?? 10000;
  const connectMs = opts.connectMs ?? 3000;
  let chan: Channel | undefined;
  let remote: AtvRemote | undefined;
  try {
    const client = await t.ensureIdentity(CERT_REF, CLIENT_NAME).catch((e: unknown) => {
      throw e instanceof DeviceError && e.code === 'notLocal'
        ? e
        : new PairError('unreachable', e instanceof Error ? e.message : String(e));
    });

    /** Steps 1 and 2: open the stream, then request, options and configuration. */
    const handshake = async (): Promise<{ chan: Channel; serverName?: string }> => {
      let stream: TvStream;
      try {
        stream = await t.openStream(tv.host, PAIR_PORT, stepMs, {
          pairing: true,
          identity: CERT_REF,
        });
      } catch (e) {
        if (e instanceof DeviceError && e.code === 'notLocal') throw e;
        throw new PairError('unreachable', e instanceof Error ? e.message : String(e));
      }
      const c = new Channel(stream);
      chan = c;
      const step = async (
        out: Parameters<typeof encodePairing>[0],
        want: PairingIn['kind'],
      ): Promise<PairingIn> => {
        c.send(out);
        for (;;) {
          const m = await c.next(stepMs);
          if (!m) throw new PairError('unreachable', 'The TV closed the connection');
          if (m.status !== STATUS_OK) {
            throw new PairError('denied', `The TV answered status ${String(m.status)}`);
          }
          if (m.msg.kind === want) return m.msg;
        }
      };
      const ack = await step(
        { kind: 'pairingRequest', clientName: CLIENT_NAME },
        'pairingRequestAck',
      );
      await step({ kind: 'options' }, 'options');
      await step({ kind: 'configuration' }, 'configurationAck');
      return {
        chan: c,
        ...(ack.kind === 'pairingRequestAck' && ack.serverName
          ? { serverName: ack.serverName }
          : {}),
      };
    };

    let session = await handshake();
    let wrong = false;
    for (;;) {
      const server = {
        modulusHex: session.chan.stream.serverModulusHex,
        exponentHex: session.chan.stream.serverExponentHex,
      };
      if (server.modulusHex === '') {
        // Not an RSA certificate: no code can ever match, so do not ask again and again.
        throw new PairError('unreachable', 'The TV certificate has no RSA key');
      }
      const typed = await prompts.askCode(wrong);
      if (typed === null) throw new PairError('cancelled');
      const code = normaliseCode(typed);
      const secret = code ? pairingSecret(client, server, code) : null;
      if (!secret) {
        wrong = true;
        continue;
      }
      if (session.chan.closed) throw new PairError('timeout', 'The TV closed the pairing');
      session.chan.send({ kind: 'secret', secret });
      const reply = await session.chan.next(stepMs);
      if (reply && reply.status === STATUS_OK && reply.msg.kind === 'secretAck') break;
      // The TV refused the secret (402) or hung up: it shows a new code on a new stream.
      session.chan.close();
      session = await handshake();
      wrong = true;
    }
    const stream = session.chan.stream;
    const subjectMac = macFromSubject(stream.serverSubject);
    session.chan.close();

    // The TV may need a moment to open the remote port after pairing: one more try after 500 ms.
    for (let attempt = 1; !remote; attempt++) {
      try {
        remote = await AtvRemote.connect(t, { host: tv.host, certRef: CERT_REF }, connectMs, {
          pairing: true,
        });
      } catch (e) {
        if (e instanceof DeviceError && e.code === 'notLocal') throw e;
        if (attempt >= 2) {
          throw new PairError(
            'unreachable',
            `The TV paired but did not open the remote on port ${String(REMOTE_PORT)}`,
          );
        }
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_REMOTE_MS));
      }
    }
    const vendorModel = `${remote.vendor ?? ''} ${remote.model ?? ''}`.trim();
    const suggestedName =
      tv.name !== DEFAULT_NAME
        ? tv.name
        : (session.serverName ?? (vendorModel !== '' ? vendorModel : DEFAULT_NAME));
    const reuse = opts.reuse;
    const reuseRef = reuse?.kind === 'androidtv' ? reuse.certRef : undefined;
    const link: TvLink = {
      kind: 'androidtv',
      host: tv.host,
      certRef: reuseRef ?? CERT_REF,
      pinSha256: remote.certSha256,
      ...(subjectMac ? { mac: subjectMac } : {}),
    };
    return { link, suggestedName };
  } finally {
    chan?.close();
    remote?.close();
  }
}
