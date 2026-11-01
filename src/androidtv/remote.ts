import { DeviceError, type Unsubscribe } from '@/core';
import type { TvStream } from '@/tv/transport';
import {
  FEATURES,
  FEATURE_VOICE,
  REMOTE_PORT,
  VOICE_CHUNK_MAX,
  VOICE_CHUNK_MIN,
  type AtvTransport,
} from './constants';
import { APP_TITLES, KEYCODE_SEARCH } from './keys';
import { decodeRemote, encodeRemote, type RemoteIn } from './messages';
import { FrameReader, frame } from './proto';

/** What the TV reports about itself while a session is up. */
export interface AtvLive {
  power?: boolean;
  volume?: number;
  muted?: boolean;
  app?: string;
}

/** Errors of a connect whose TLS completed and whose peer then hung up before the session `start`. */
const hungUp = new WeakSet<object>();

/** True for the rejection of `AtvRemote.connect` when TLS completed and the TV then closed the
 *  stream before `start`. That is how an Android TV treats a client certificate it does not know
 *  (the transport reports a handshake failure and a timeout alike as `notSent`, so this is the only
 *  signal that tells "forgot this phone" from "slow or asleep"). */
export function hungUpBeforeStart(err: unknown): boolean {
  return typeof err === 'object' && err !== null && hungUp.has(err);
}

const NO_FIELD = 'No text field is open on the TV';

/** A `startVoice` waiting for the TV's `remote_voice_begin`. */
interface VoiceWait {
  resolve: (sessionId: number) => void;
  reject: (e: DeviceError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One remote session with an Android TV (port 6466). */
export class AtvRemote {
  readonly certSha256: string;
  vendor: string | undefined;
  model: string | undefined;

  private state: AtvLive = {};
  private lastJson = '{}';
  private closed = false;
  private ownClose = false;
  private features = FEATURES;
  private ime: { imeCounter: number; fieldCounter: number } | undefined;
  private voiceWait: VoiceWait | undefined;
  private voiceId: number | undefined;
  private voiceBuf = new Uint8Array(0);
  private silent: ReturnType<typeof setTimeout> | undefined;
  private liveCbs = new Set<(l: AtvLive) => void>();
  private closeCbs: (() => void)[] = [];
  private endCb: (() => void) | undefined;
  private onStart: (() => void) | undefined;
  private readonly reader = new FrameReader();

  private constructor(
    private readonly stream: TvStream,
    private readonly silentMs: number,
  ) {
    this.certSha256 = stream.certSha256;
  }

  /** Opens the session. Resolves on the first `start`; rejects `notSent` after `timeoutMs`
   *  (`notPaired` and `notLocal` pass through). */
  static async connect(
    t: Pick<AtvTransport, 'openStream'>,
    link: { host: string; certRef: string; pinSha256?: string },
    timeoutMs: number,
    opts: { pairing?: boolean; silentMs?: number } = {},
  ): Promise<AtvRemote> {
    const tls = opts.pairing
      ? { identity: link.certRef, pairing: true }
      : { identity: link.certRef, ...(link.pinSha256 ? { pinSha256: link.pinSha256 } : {}) };
    const started = Date.now();
    const stream = await t.openStream(link.host, REMOTE_PORT, timeoutMs, tls);
    const remote = new AtvRemote(stream, opts.silentMs ?? 16000);
    const left = Math.max(1, timeoutMs - (Date.now() - started));
    return new Promise<AtvRemote>((resolve, reject) => {
      const timer = setTimeout(() => {
        remote.close();
        reject(new DeviceError('notSent', 'The TV did not start the remote session'));
      }, left);
      remote.onStart = () => {
        clearTimeout(timer);
        remote.onStart = undefined;
        resolve(remote);
      };
      remote.endCb = () => {
        clearTimeout(timer);
        const err = new DeviceError('notSent', 'The TV closed the connection');
        hungUp.add(err);
        reject(err);
      };
      remote.attach();
    });
  }

  get live(): Readonly<AtvLive> {
    return this.state;
  }

  /** Writes one SHORT key. Throws DeviceError('notSent') once closed. */
  key(code: number): void {
    this.write(encodeRemote({ kind: 'key', code, direction: 3 }));
  }

  /** Types into the field that is open on the TV. Throws `notSent` when none was seen. */
  text(value: string): void {
    if (this.closed) throw new DeviceError('notSent', 'The connection is closed');
    if (!this.ime) throw new DeviceError('notSent', NO_FIELD, 'noTextField');
    this.write(encodeRemote({ kind: 'imeText', ...this.ime, text: value }));
  }

  /** True when the TV accepted the voice feature in this session. */
  get voiceSupported(): boolean {
    return (this.features & FEATURE_VOICE) !== 0;
  }

  /** Starts a voice session: sends the search key, waits for the TV's `remote_voice_begin`, echoes
   *  it and resolves with the session id. Rejects `notSent` on a timeout, when the TV has no voice,
   *  when the stream closes meanwhile, and when a session is already open or starting. */
  startVoice(timeoutMs = 2000): Promise<number> {
    if (this.closed) return Promise.reject(new DeviceError('notSent', 'The connection is closed'));
    if (!this.voiceSupported) {
      return Promise.reject(new DeviceError('notSent', 'This TV does not take voice'));
    }
    if (this.voiceWait || this.voiceId !== undefined) {
      return Promise.reject(new DeviceError('notSent', 'A voice session is already open'));
    }
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.voiceWait = undefined;
        reject(new DeviceError('notSent', 'The TV did not start a voice session'));
      }, timeoutMs);
      this.voiceWait = { resolve, reject, timer };
      try {
        this.key(KEYCODE_SEARCH);
      } catch (e) {
        clearTimeout(timer);
        this.voiceWait = undefined;
        reject(e instanceof DeviceError ? e : new DeviceError('notSent', 'The write failed'));
      }
    });
  }

  /** Sends PCM16 LE mono 8 kHz audio of session `sessionId`, in messages of 8192 to 20480 bytes.
   *  Audio is held until 8192 bytes have gathered, since a short message is zero-padded and the
   *  padding is heard as silence; `endVoice` sends what is left. The samples are never logged.
   *  Throws `notSent` when that session is not open. */
  sendVoice(sessionId: number, pcm: Uint8Array): void {
    if (this.closed) throw new DeviceError('notSent', 'The connection is closed');
    if (this.voiceId !== sessionId) throw new DeviceError('notSent', 'The voice session is over');
    if (pcm.length === 0) return;
    const held = new Uint8Array(this.voiceBuf.length + pcm.length);
    held.set(this.voiceBuf);
    held.set(pcm, this.voiceBuf.length);
    if (held.length < VOICE_CHUNK_MIN) {
      this.voiceBuf = held;
      return;
    }
    this.voiceBuf = new Uint8Array(0);
    this.writeVoice(sessionId, held);
  }

  /** Sends the held audio, then ends the voice session. Idempotent; a session that is not open is
   *  ignored. */
  endVoice(sessionId: number): void {
    if (this.voiceId !== sessionId) return;
    this.voiceId = undefined;
    const rest = this.voiceBuf;
    this.voiceBuf = new Uint8Array(0);
    if (rest.length > 0) {
      try {
        this.writeVoice(sessionId, rest);
      } catch {
        return; // the stream ended; finish() already ran
      }
    }
    this.send({ kind: 'voiceEnd', sessionId });
  }

  /** Writes `pcm` in messages of at most 20480 bytes, zero-padding a short last one to 8192. */
  private writeVoice(sessionId: number, pcm: Uint8Array): void {
    for (let i = 0; i < pcm.length; i += VOICE_CHUNK_MAX) {
      let samples = pcm.slice(i, i + VOICE_CHUNK_MAX);
      if (samples.length < VOICE_CHUNK_MIN) {
        const padded = new Uint8Array(VOICE_CHUNK_MIN);
        padded.set(samples);
        samples = padded;
      }
      this.write(encodeRemote({ kind: 'voicePayload', sessionId, samples }));
    }
  }

  onLive(cb: (l: AtvLive) => void): Unsubscribe {
    this.liveCbs.add(cb);
    return () => {
      this.liveCbs.delete(cb);
    };
  }

  /** Fires once when the session ends for any reason but our own `close()`. */
  onClose(cb: () => void): void {
    if (this.closed && !this.ownClose) {
      cb();
      return;
    }
    if (!this.closed) this.closeCbs.push(cb);
  }

  close(): void {
    if (this.closed) return;
    this.ownClose = true;
    this.finish();
    this.stream.close();
  }

  // ---- internals -------------------------------------------------------------------------------

  private attach(): void {
    this.stream.onData((bytes) => this.onBytes(bytes));
    this.stream.onClose(() => {
      this.finish();
    });
    this.armSilence();
  }

  private write(msg: Uint8Array): void {
    if (this.closed) throw new DeviceError('notSent', 'The connection is closed');
    try {
      this.stream.write(frame(msg));
    } catch (e) {
      this.finish();
      this.stream.close();
      throw e instanceof DeviceError ? e : new DeviceError('notSent', 'The write failed');
    }
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.silent) clearTimeout(this.silent);
    this.silent = undefined;
    const cbs = this.closeCbs;
    this.closeCbs = [];
    // A pending connect() must end whatever the reason; onClose callbacks hear only of the rest.
    this.endCb?.();
    this.endCb = undefined;
    this.voiceId = undefined;
    this.voiceBuf = new Uint8Array(0);
    if (this.voiceWait) {
      clearTimeout(this.voiceWait.timer);
      this.voiceWait.reject(new DeviceError('notSent', 'The TV closed the connection'));
      this.voiceWait = undefined;
    }
    if (!this.ownClose) cbs.forEach((cb) => cb());
  }

  private armSilence(): void {
    if (this.silent) clearTimeout(this.silent);
    this.silent = setTimeout(() => {
      this.silent = undefined;
      if (this.closed) return;
      this.stream.close();
      this.finish();
    }, this.silentMs);
  }

  private onBytes(bytes: Uint8Array): void {
    if (this.closed) return;
    this.armSilence();
    let frames: Uint8Array[];
    try {
      frames = this.reader.push(bytes);
    } catch {
      this.stream.close();
      this.finish();
      return;
    }
    for (const f of frames) {
      if (this.closed) return;
      let m: RemoteIn;
      try {
        m = decodeRemote(f);
      } catch {
        continue; // one malformed message does not end the session
      }
      this.handle(m);
    }
  }

  private handle(m: RemoteIn): void {
    switch (m.kind) {
      case 'configure':
        this.vendor = m.vendor;
        this.model = m.model;
        this.features = FEATURES & m.features;
        this.send({ kind: 'configure', features: this.features });
        return;
      case 'setActive':
        this.send({ kind: 'setActive', active: this.features });
        return;
      case 'ping':
        this.send({ kind: 'pong', val1: m.val1 });
        return;
      case 'start':
        this.update({ power: m.started });
        this.onStart?.();
        return;
      case 'volume':
        if (m.max > 0) {
          this.update({ volume: Math.round((100 * m.level) / m.max), muted: m.muted });
        }
        return;
      case 'imeKeyInject': {
        const title = m.appPackage === undefined ? undefined : APP_TITLES[m.appPackage];
        this.update({ app: title });
        return;
      }
      case 'imeBatchEdit':
        this.ime = { imeCounter: m.imeCounter, fieldCounter: m.fieldCounter };
        return;
      case 'voiceBegin': {
        const wait = this.voiceWait;
        if (!wait) {
          // Too late (we gave up waiting): close it so the TV's assistant is not left open.
          this.send({ kind: 'voiceEnd', sessionId: m.sessionId });
          return;
        }
        this.voiceWait = undefined;
        clearTimeout(wait.timer);
        this.voiceId = m.sessionId;
        this.send({ kind: 'voiceBegin', sessionId: m.sessionId });
        wait.resolve(m.sessionId);
        return;
      }
      default:
        return;
    }
  }

  private send(m: Parameters<typeof encodeRemote>[0]): void {
    try {
      this.write(encodeRemote(m));
    } catch {
      // the stream ended; finish() already ran
    }
  }

  /** Merges `delta` (an undefined value removes the field) and tells listeners when it changed. */
  private update(delta: Partial<AtvLive>): void {
    const next: AtvLive = { ...this.state };
    for (const [k, v] of Object.entries(delta) as [keyof AtvLive, AtvLive[keyof AtvLive]][]) {
      if (v === undefined) delete next[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    const json = JSON.stringify(next);
    this.state = next;
    if (json === this.lastJson) return;
    this.lastJson = json;
    [...this.liveCbs].forEach((cb) => cb({ ...next }));
  }
}
