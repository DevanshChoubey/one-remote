import dgram from 'react-native-udp';
import type { Prefix } from '@/transport/localOnly';
import { createRnGreeUdp } from '@/transport/greeUdp';

jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const LAN: Prefix[] = [{ address: '192.168.1.7', bits: 24 }];
const lan = (): Promise<Prefix[]> => Promise.resolve(LAN);

class FakeUdp {
  static all: FakeUdp[] = [];
  handlers = new Map<string, (...a: unknown[]) => void>();
  sends: { msg: string; port: number; address: string }[] = [];
  broadcast = false;
  closed = false;
  /** Fails the send to these addresses (all when '*'). */
  failTo = new Set<string>();
  bindError = false;
  constructor() {
    FakeUdp.all.push(this);
  }
  on(e: string, cb: (...a: unknown[]) => void): void {
    this.handlers.set(e, cb);
  }
  once(e: string, cb: (...a: unknown[]) => void): void {
    this.handlers.set(e, cb);
  }
  bind(): void {
    if (this.bindError) throw new Error('EADDRINUSE');
    void Promise.resolve().then(() => this.handlers.get('listening')?.());
  }
  send(
    msg: string,
    _o: number,
    _l: number,
    port: number,
    address: string,
    cb: (e?: Error) => void,
  ): void {
    this.sends.push({ msg, port, address });
    cb(this.failTo.has('*') || this.failTo.has(address) ? new Error('ENETUNREACH') : undefined);
  }
  setBroadcast(f: boolean): void {
    this.broadcast = f;
  }
  close(): void {
    this.closed = true;
  }
  reply(msg: unknown, address: string): void {
    this.handlers.get('message')?.(msg, { address });
  }
}

let next: ((s: FakeUdp) => void) | undefined;

beforeEach(() => {
  FakeUdp.all = [];
  next = undefined;
  (dgram.createSocket as jest.Mock).mockReset();
  (dgram.createSocket as jest.Mock).mockImplementation(() => {
    const s = new FakeUdp();
    next?.(s);
    return s;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('request', () => {
  it('refuses a host off the home network before opening a socket', async () => {
    const udp = createRnGreeUdp({ prefixes: lan, os: 'android' });
    await expect(udp.request('8.8.8.8', '{}', 500)).rejects.toMatchObject({ code: 'notLocal' });
    expect(dgram.createSocket).not.toHaveBeenCalled();
  });

  it('sends to port 7000 and resolves with the reply from that host only', async () => {
    const udp = createRnGreeUdp({ prefixes: lan, os: 'android' });
    const p = udp.request('192.168.1.40', '{"t":"pack"}', 500);
    await flush();
    const s = FakeUdp.all[0] as FakeUdp;
    expect(s.sends).toEqual([{ msg: '{"t":"pack"}', port: 7000, address: '192.168.1.40' }]);
    s.reply('{"from":"other"}', '192.168.1.41');
    s.reply(new Uint8Array([123, 125]), '192.168.1.40');
    await expect(p).resolves.toBe('{}');
    expect(s.closed).toBe(true);
  });

  it('times out after a send, and says notSent when the send failed', async () => {
    jest.useFakeTimers();
    const udp = createRnGreeUdp({ prefixes: lan, os: 'android' });
    const p = udp.request('192.168.1.40', '{}', 500);
    const timedOut = expect(p).rejects.toMatchObject({ code: 'timeout' });
    await jest.advanceTimersByTimeAsync(500);
    await timedOut;
    next = (s) => s.failTo.add('*');
    await expect(udp.request('192.168.1.40', '{}', 500)).rejects.toMatchObject({ code: 'notSent' });
    next = (s) => {
      s.bindError = true;
    };
    await expect(udp.request('192.168.1.40', '{}', 500)).rejects.toMatchObject({ code: 'notSent' });
  });

  it('maps a socket error', async () => {
    const udp = createRnGreeUdp({ prefixes: lan, os: 'android' });
    const p = udp.request('192.168.1.40', '{}', 500);
    await flush();
    FakeUdp.all[0]?.handlers.get('error')?.(new Error('boom'));
    await expect(p).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('scan', () => {
  it('broadcasts on Android, asks each host too, and keeps local replies only', async () => {
    jest.useFakeTimers();
    const udp = createRnGreeUdp({ prefixes: lan, os: 'android' });
    const replies: [string, string][] = [];
    const p = udp.scan('{"t":"scan"}', 1000, (t, h) => replies.push([t, h]));
    await jest.advanceTimersByTimeAsync(0);
    const s = FakeUdp.all[0] as FakeUdp;
    expect(s.broadcast).toBe(true);
    expect(s.sends[0]).toEqual({ msg: '{"t":"scan"}', port: 7000, address: '192.168.1.255' });
    expect(s.sends).toHaveLength(1 + 253);
    expect(s.sends.some((x) => x.address === '192.168.1.7')).toBe(false);
    s.reply('a', '192.168.1.40');
    s.reply('b', '203.0.113.9');
    await jest.advanceTimersByTimeAsync(1000);
    await p;
    expect(replies).toEqual([['a', '192.168.1.40']]);
    expect(s.closed).toBe(true);
  });

  it('asks each host on iOS, where broadcast needs an entitlement', async () => {
    jest.useFakeTimers();
    const udp = createRnGreeUdp({ prefixes: lan, os: 'ios' });
    const p = udp.scan('{"t":"scan"}', 100, () => undefined);
    await jest.advanceTimersByTimeAsync(0);
    const s = FakeUdp.all[0] as FakeUdp;
    expect(s.broadcast).toBe(false);
    expect(s.sends.every((x) => x.address !== '192.168.1.255')).toBe(true);
    await jest.advanceTimersByTimeAsync(100);
    await p;
  });

  it('fails off Wi-Fi, and when nothing went out', async () => {
    const off = createRnGreeUdp({ prefixes: () => Promise.resolve([]), os: 'android' });
    await expect(off.scan('{}', 100, () => undefined)).rejects.toMatchObject({ code: 'notSent' });
    await expect(off.onWifi()).resolves.toBe(false);
    next = (s) => s.failTo.add('*');
    const udp = createRnGreeUdp({ prefixes: lan, os: 'android' });
    await expect(udp.scan('{}', 100, () => undefined)).rejects.toMatchObject({ code: 'notSent' });
    await expect(udp.onWifi()).resolves.toBe(true);
  });

  it('refuses a prefix that has no local hosts', async () => {
    const udp = createRnGreeUdp({
      prefixes: () => Promise.resolve([{ address: '8.8.8.8', bits: 32 }]),
      os: 'ios',
    });
    await expect(udp.scan('{}', 100, () => undefined)).rejects.toMatchObject({ code: 'notLocal' });
  });

  it('opens nothing when built', () => {
    createRnGreeUdp();
    expect(dgram.createSocket).not.toHaveBeenCalled();
  });
});
