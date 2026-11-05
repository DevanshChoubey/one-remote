import { DeviceError } from '@/core';
import type { TvSocket, TvTls, TvTransport } from '@/tv/transport';
import { keyFrame, parseEvent, textFrame } from './frames';
import { socketUrl } from './url';

type Outcome = { token: string } | { error: DeviceError };

/** One remote-control session with one Samsung TV. Pure: the network is behind `TvTransport`. */
export class SamsungClient {
  private closed = false;
  private outcome: Outcome | undefined;
  private waiters: ((o: Outcome) => void)[] = [];
  private readonly closeCbs: (() => void)[] = [];

  /** The pin passed in, or the certificate seen while pairing. */
  readonly certSha256: string | undefined;

  private constructor(
    private readonly sock: TvSocket,
    certSha256: string | undefined,
  ) {
    this.certSha256 = certSha256;
    sock.onMessage((text) => {
      const e = parseEvent(text);
      if (!e) return;
      if (e.event === 'ms.channel.connect') this.settle({ token: e.token });
      else if (e.event === 'ms.channel.unauthorized' || e.event === 'ms.channel.timeout') {
        this.settle({ error: new DeviceError('notPaired', e.event) });
      } else if (e.event === 'ms.error' && /unauthorized/i.test(e.message)) {
        this.settle({ error: new DeviceError('notPaired', e.message) });
      }
    });
    sock.onClose(() => {
      if (this.closed) return;
      this.closed = true;
      this.settle({ error: new DeviceError('notSent', 'The TV closed the connection') });
      this.closeCbs.forEach((cb) => cb());
    });
  }

  /** Opens the wss socket only; does not wait for the TV's answer. `token: ''` or absent: no
   *  token. A certificate other than `pinSha256` rejects `notPaired`. */
  static async connect(
    t: TvTransport,
    o: { host: string; token?: string; pinSha256?: string; pairing?: boolean },
    timeoutMs: number,
  ): Promise<SamsungClient> {
    const tls: TvTls = o.pinSha256
      ? { pinSha256: o.pinSha256 }
      : o.pairing
        ? { pairing: true }
        : {};
    const sock = await t.open(socketUrl(o.host, o.token ?? ''), timeoutMs, tls);
    return new SamsungClient(sock, o.pinSha256 ?? sock.certSha256);
  }

  private settle(o: Outcome): void {
    if (this.outcome) return;
    this.outcome = o;
    const waiting = this.waiters;
    this.waiters = [];
    waiting.forEach((w) => w(o));
  }

  /** Resolves the token ('' when the TV sends none) on `ms.channel.connect`. Rejects `notPaired`
   *  when the TV refuses, `timeout` after `timeoutMs`, `notSent` if the socket closes first. */
  ready(timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const finish = (o: Outcome): void => ('token' in o ? resolve(o.token) : reject(o.error));
      if (this.outcome) return finish(this.outcome);
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new DeviceError('timeout', 'The TV did not answer'));
      }, timeoutMs);
      const waiter = (o: Outcome): void => {
        clearTimeout(timer);
        finish(o);
      };
      this.waiters.push(waiter);
    });
  }

  /** Written at once; the TV does not acknowledge. Throws `notSent` when closed. */
  key(keyName: string): void {
    this.write(keyFrame(keyName));
  }

  text(text: string): void {
    this.write(textFrame(text));
  }

  private write(frame: string): void {
    if (this.closed) throw new DeviceError('notSent', 'closed');
    try {
      this.sock.send(frame);
    } catch {
      throw new DeviceError('notSent', 'socket closed');
    }
  }

  onClose(cb: () => void): void {
    this.closeCbs.push(cb);
  }

  /** Closes the session; `onClose` callbacks do not fire. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.settle({ error: new DeviceError('notSent', 'closed') });
    this.sock.close();
  }
}
