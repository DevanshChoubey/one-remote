import { DeviceError, type Unsubscribe } from '@/core';
import { manifest } from './manifest';
import { parseSocketUrl } from './url';
import { buttonFrame, decodeSsap, encodeSsap, URI, type SsapIn, type SsapOut } from './ssap';
import type { TvSocket, TvTransport } from './transport';

const REQUEST_MS = 1500;

/** The TV answered a request with an SSAP `error`: it refused, so nothing was done, and the link
 *  is alive. Code `notSent`. */
export class SsapReplyError extends DeviceError {
  constructor(readonly tvError: string) {
    super('notSent', tvError);
    this.name = 'SsapReplyError';
    Object.setPrototypeOf(this, SsapReplyError.prototype);
  }
}

interface Handler {
  onMessage(m: SsapIn): void;
  fail(e: DeviceError): void;
}

/** One SSAP session with one TV. Pure: the network is behind `TvTransport`. */
export class SsapClient {
  private readonly handlers = new Map<string, Handler>();
  private readonly closeCbs: (() => void)[] = [];
  private readonly prefix = Math.random().toString(36).slice(2, 6);
  private n = 0;
  private closed = false;
  private pointer: Promise<TvSocket> | undefined;

  private constructor(
    private readonly t: TvTransport,
    private readonly sock: TvSocket,
    private readonly host: string,
  ) {
    sock.onMessage((text) => {
      const m = decodeSsap(text);
      if (m) this.handlers.get(m.id)?.onMessage(m);
    });
    sock.onClose(() => {
      if (this.closed) return;
      this.shutdown();
      this.closeCbs.forEach((cb) => cb());
    });
  }

  static async connect(
    t: TvTransport,
    link: { host: string; secure: boolean },
    timeoutMs: number,
  ): Promise<SsapClient> {
    const url = link.secure ? `wss://${link.host}:3001` : `ws://${link.host}:3000`;
    return new SsapClient(t, await t.open(url, timeoutMs), link.host);
  }

  /** Resolves the client key. `onPrompt` fires once when the TV shows its prompt. Rejects
   *  `notPaired` (with the TV's text) when the TV refuses, `timeout` after `timeoutMs`. */
  register(
    clientKey: string | undefined,
    onPrompt: () => void,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (this.closed) return reject(new DeviceError('notSent', 'closed'));
      const id = `${this.prefix}_register`;
      let prompted = false;
      const done = (): void => {
        clearTimeout(timer);
        this.handlers.delete(id);
      };
      const timer = setTimeout(() => {
        done();
        reject(new DeviceError('timeout', 'register'));
      }, timeoutMs);
      this.handlers.set(id, {
        onMessage: (m) => {
          if (m.type === 'registered') {
            done();
            resolve(m.payload['client-key']);
          } else if (m.type === 'error') {
            done();
            reject(new DeviceError('notPaired', m.error));
          } else if (m.payload.pairingType === 'PROMPT' && !prompted) {
            prompted = true;
            onPrompt();
          }
        },
        fail: (e) => {
          done();
          reject(e);
        },
      });
      const payload: Extract<SsapOut, { type: 'register' }>['payload'] = {
        forcePairing: false,
        pairingType: 'PROMPT',
        manifest,
        ...(clientKey === undefined ? {} : { 'client-key': clientKey }),
      };
      this.write({ type: 'register', id, payload }, (e) => {
        done();
        reject(e);
      });
    });
  }

  /** `error` replies reject `notSent` (with the TV's text); no reply in time rejects `timeout`. */
  request(
    uri: string,
    payload?: object,
    timeoutMs: number = REQUEST_MS,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new DeviceError('notSent', 'closed'));
      const id = `${this.prefix}_${this.n++}`;
      let written = false;
      const done = (): void => {
        clearTimeout(timer);
        this.handlers.delete(id);
      };
      const timer = setTimeout(() => {
        done();
        reject(new DeviceError('timeout', uri));
      }, timeoutMs);
      this.handlers.set(id, {
        onMessage: (m) => {
          if (m.type === 'response') {
            done();
            resolve(m.payload);
          } else if (m.type === 'error') {
            done();
            reject(new SsapReplyError(m.error));
          }
        },
        // Once the frame left, a close may or may not have been after the TV acted on it.
        fail: (e) => {
          done();
          reject(written ? new DeviceError('timeout', `${uri} (connection closed)`) : e);
        },
      });
      const frame: SsapOut =
        payload === undefined
          ? { type: 'request', id, uri }
          : { type: 'request', id, uri, payload };
      written = true; // a close during the write itself still counts: it may have left
      this.write(frame, (e) => {
        written = false;
        done();
        reject(e);
      });
    });
  }

  subscribe(uri: string, cb: (p: Record<string, unknown>) => void): Unsubscribe {
    if (this.closed) return () => undefined;
    const id = `${this.prefix}_${this.n++}`;
    this.handlers.set(id, {
      onMessage: (m) => {
        if (m.type === 'response') cb(m.payload);
      },
      fail: () => undefined,
    });
    this.write({ type: 'subscribe', id, uri }, () => this.handlers.delete(id));
    return () => {
      if (!this.handlers.delete(id) || this.closed) return;
      this.write({ type: 'unsubscribe', id }, () => undefined);
    };
  }

  /** Writes one button press to the pointer socket (opened on first use, then reused). The press
   *  is written within `timeoutMs` or rejects `notSent` without being written, ever. */
  button(name: string, timeoutMs: number = REQUEST_MS): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        reject(new DeviceError('notSent', 'button timed out'));
      }, timeoutMs);
      this.pointerSocket(timeoutMs).then(
        (sock) => {
          if (expired) return;
          clearTimeout(timer);
          try {
            sock.send(buttonFrame(name));
            resolve();
          } catch {
            reject(new DeviceError('notSent', 'pointer socket closed'));
          }
        },
        (e: unknown) => {
          if (expired) return;
          clearTimeout(timer);
          reject(e instanceof DeviceError ? e : new DeviceError('notSent', String(e)));
        },
      );
    });
  }

  onClose(cb: () => void): void {
    this.closeCbs.push(cb);
  }

  /** Closes the session. Pending requests reject `notSent`; `onClose` callbacks do not fire. */
  close(): void {
    if (this.closed) return;
    this.shutdown();
  }

  private shutdown(): void {
    this.closed = true;
    const pending = [...this.handlers.values()];
    this.handlers.clear();
    pending.forEach((h) => h.fail(new DeviceError('notSent', 'closed')));
    const pointer = this.pointer;
    this.pointer = undefined;
    pointer?.then((s) => s.close()).catch(() => undefined);
    this.sock.close();
  }

  private write(frame: SsapOut, onFail: (e: DeviceError) => void): void {
    try {
      this.sock.send(encodeSsap(frame));
    } catch {
      onFail(new DeviceError('notSent', 'socket closed'));
    }
  }

  private pointerSocket(timeoutMs: number): Promise<TvSocket> {
    if (this.pointer) return this.pointer;
    const p = this.request(URI.pointer, undefined, timeoutMs)
      .then((r) => {
        if (typeof r.socketPath !== 'string') throw new DeviceError('notSent', 'no pointer socket');
        // The TV must not point us at another machine.
        if (parseSocketUrl(r.socketPath)?.host !== this.host) {
          throw new DeviceError('notSent', 'pointer socket is not on the TV');
        }
        return this.t.open(r.socketPath, timeoutMs);
      })
      .then((sock) => {
        if (this.closed) {
          sock.close();
          throw new DeviceError('notSent', 'closed');
        }
        sock.onClose(() => {
          if (this.pointer === p) this.pointer = undefined;
        });
        return sock;
      });
    this.pointer = p;
    p.catch(() => {
      if (this.pointer === p) this.pointer = undefined;
    });
    return p;
  }
}
