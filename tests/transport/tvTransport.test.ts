import { Platform } from 'react-native';
import dgram from 'react-native-udp';
import { DeviceError } from '@/core';
import type { Prefix } from '@/transport/localOnly';
import { createRnTvTransport } from '@/transport/tvTransport';
import { magicPacket } from '@/webos/wol';
import { lanSocket } from '../../modules/lan-socket';

jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const LAN: Prefix[] = [{ address: '192.168.1.7', bits: 24 }];
const lan = (): Promise<Prefix[]> => Promise.resolve(LAN);

// --- a fake lan-socket native module -------------------------------------------------------------
interface FakeOpen {
  id: string;
  url: string;
  opts: { pinSha256?: string; pairing?: boolean; probe?: boolean; timeoutMs: number };
  resolve(r: { certSha256?: string }): void;
  reject(e: unknown): void;
}

function nativeError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

class FakeNative {
  opens: FakeOpen[] = [];
  sent: [string, string][] = [];
  closed: string[] = [];
  behave: ((o: FakeOpen) => void) | undefined;
  throwOnOpen = false;
  private listeners: Record<'message' | 'close', ((e: never) => void)[]> = {
    message: [],
    close: [],
  };
  open(id: string, url: string, opts: FakeOpen['opts']): Promise<{ certSha256?: string }> {
    if (this.throwOnOpen) throw new Error('native module missing');
    return new Promise((resolve, reject) => {
      const o: FakeOpen = { id, url, opts, resolve, reject };
      this.opens.push(o);
      const behave = this.behave;
      if (behave) void Promise.resolve().then(() => behave(o));
    });
  }
  send(id: string, text: string): void {
    this.sent.push([id, text]);
  }
  close(id: string): void {
    this.closed.push(id);
  }
  addListener(event: 'message' | 'close', cb: (e: never) => void): { remove(): void } {
    this.listeners[event].push(cb);
    return { remove: () => undefined };
  }
  emit(event: 'message' | 'close', e: object): void {
    this.listeners[event].forEach((cb) => cb(e as never));
  }
}

let mockNative: FakeNative;

jest.mock('../../modules/lan-socket', () => ({
  LAN_ERRORS: {
    notLocal: 'ERR_LAN_NOT_LOCAL',
    noTrust: 'ERR_LAN_NO_TRUST',
    pinMismatch: 'ERR_LAN_PIN_MISMATCH',
    openFailed: 'ERR_LAN_OPEN_FAILED',
  },
  lanSocket: jest.fn(() => mockNative),
}));

// --- a fake UDP socket --------------------------------------------------------------------------
class FakeUdp {
  static last: FakeUdp | undefined;
  handlers = new Map<string, (...a: unknown[]) => void>();
  sends: { msg: unknown; port: number; address: string }[] = [];
  broadcast = false;
  closed = false;
  sendError: Error | undefined;
  bindError = false;
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
    msg: unknown,
    _o: number,
    _l: number,
    port: number,
    address: string,
    cb: (e?: Error) => void,
  ): void {
    this.sends.push({ msg, port, address });
    cb(this.sendError);
  }
  setBroadcast(f: boolean): void {
    this.broadcast = f;
  }
  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  (dgram.createSocket as jest.Mock).mockReset();
  mockNative = new FakeNative();
  (lanSocket as jest.Mock).mockClear();
  (dgram.createSocket as jest.Mock).mockImplementation(() => {
    FakeUdp.last = new FakeUdp();
    return FakeUdp.last;
  });
  FakeUdp.last = undefined;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('open', () => {
  it('rejects notLocal for a public address and never calls native', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.open('ws://8.8.8.8:3000', 1500)).rejects.toMatchObject({ code: 'notLocal' });
    await expect(
      t.open('wss://[2001:4860::1]:3001', 1500, { pairing: true }),
    ).rejects.toMatchObject({ code: 'notLocal' });
    expect(mockNative.opens).toHaveLength(0);
    expect(lanSocket).not.toHaveBeenCalled();
  });

  it('opens a local socket and relays messages, buffering until a listener exists', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const p = t.open('ws://192.168.1.23:3000', 1500);
    await flush();
    const o = mockNative.opens[0] as FakeOpen;
    expect(o.url).toBe('ws://192.168.1.23:3000');
    expect(o.opts).toEqual({ timeoutMs: 1500 });
    o.resolve({});
    const sock = await p;
    expect(sock.certSha256).toBeUndefined();
    mockNative.emit('message', { id: o.id, data: 'early' });
    mockNative.emit('message', { id: 'someone-else', data: 'stray' });
    const got: string[] = [];
    sock.onMessage((m) => got.push(m));
    mockNative.emit('message', { id: o.id, data: 'late' });
    expect(got).toEqual(['early', 'late']);
    sock.send('hello');
    expect(mockNative.sent).toEqual([[o.id, 'hello']]);
  });

  it('gives each socket its own id', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    mockNative.behave = (o) => o.resolve({});
    await t.open('ws://192.168.1.23:3000', 1500);
    await t.open('ws://192.168.1.23:3000', 1500);
    expect(new Set(mockNative.opens.map((o) => o.id)).size).toBe(2);
  });

  it('fires onClose for a remote close, not for our own, and refuses sends after a close', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    mockNative.behave = (o) => o.resolve({});
    const s1 = await t.open('ws://192.168.1.23:3000', 1500);
    const id1 = mockNative.opens[0]?.id as string;
    const c1 = jest.fn();
    s1.onClose(c1);
    mockNative.emit('close', { id: id1, code: 1001, reason: 'bye' });
    expect(c1).toHaveBeenCalledTimes(1);
    expect(() => s1.send('x')).toThrow(DeviceError);
    const s2 = await t.open('ws://192.168.1.23:3000', 1500);
    const id2 = mockNative.opens[1]?.id as string;
    const c2 = jest.fn();
    s2.onClose(c2);
    s2.close();
    s2.close();
    expect(mockNative.closed).toEqual([id2]);
    mockNative.emit('close', { id: id2, error: 'late' });
    expect(c2).not.toHaveBeenCalled();
  });

  it('keeps the native error text and maps the native codes', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const cases: [string, string, string][] = [
      ['ERR_LAN_OPEN_FAILED', 'SocketTimeoutException: connect timed out', 'notSent'],
      ['ERR_LAN_PIN_MISMATCH', 'certificate does not match', 'notPaired'],
      ['ERR_LAN_NO_TRUST', 'wss needs a pinned certificate', 'notPaired'],
      ['ERR_LAN_NOT_LOCAL', 'Address is not a local IP', 'notLocal'],
    ];
    for (const [code, message, want] of cases) {
      mockNative.behave = (o) => o.reject(nativeError(code, message));
      const err = await t
        .open('wss://192.168.1.23:3001', 1500, { pinSha256: 'ab' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DeviceError);
      expect(err).toMatchObject({ code: want });
      expect((err as Error).message).toContain(message);
      expect((err as Error).message).toContain('wss://192.168.1.23:3001');
    }
    mockNative.behave = (o) => o.reject('plain string');
    await expect(t.open('ws://192.168.1.23:3000', 1500)).rejects.toMatchObject({
      code: 'notSent',
      message: expect.stringContaining('plain string'),
    });
  });

  it('rejects notSent when the native module throws', async () => {
    mockNative.throwOnOpen = true;
    await expect(
      createRnTvTransport({ prefixes: lan }).open('ws://192.168.1.23:3000', 1500),
    ).rejects.toMatchObject({ code: 'notSent', message: expect.stringContaining('missing') });
  });

  it('rejects notSent after timeoutMs, cancels the native open and closes a late socket', async () => {
    jest.useFakeTimers();
    const t = createRnTvTransport({ prefixes: lan });
    let err: unknown;
    t.open('ws://192.168.1.23:3000', 1500).catch((e: unknown) => (err = e));
    await jest.advanceTimersByTimeAsync(1499);
    expect(err).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(err).toBeInstanceOf(DeviceError);
    expect((err as DeviceError).code).toBe('notSent');
    const o = mockNative.opens[0] as FakeOpen;
    expect(mockNative.closed).toEqual([o.id]);
    o.resolve({});
    await jest.advanceTimersByTimeAsync(0);
    expect(mockNative.closed).toEqual([o.id, o.id]);
  });
});

describe('open: TLS', () => {
  it('refuses wss with neither a pin nor pairing, without calling native', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.open('wss://192.168.1.23:3001', 1500)).rejects.toMatchObject({
      code: 'notPaired',
    });
    await expect(t.open('wss://192.168.1.23:3001', 1500, {})).rejects.toMatchObject({
      code: 'notPaired',
    });
    expect(mockNative.opens).toHaveLength(0);
  });

  it('pairing asks native to trust on first use and reports the certificate', async () => {
    mockNative.behave = (o) => o.resolve({ certSha256: 'ab12' });
    const sock = await createRnTvTransport({ prefixes: lan }).open(
      'wss://192.168.1.23:3001',
      1500,
      { pairing: true },
    );
    expect(mockNative.opens[0]?.opts).toEqual({ timeoutMs: 1500, pairing: true });
    expect(sock.certSha256).toBe('ab12');
  });

  it('passes the pin to native', async () => {
    mockNative.behave = (o) => o.resolve({ certSha256: 'ab12' });
    await createRnTvTransport({ prefixes: lan }).open('wss://192.168.1.23:3001', 1500, {
      pinSha256: 'ab12',
    });
    expect(mockNative.opens[0]?.opts).toEqual({ timeoutMs: 1500, pinSha256: 'ab12' });
  });

  it('ignores TLS options for plain ws', async () => {
    mockNative.behave = (o) => o.resolve({});
    await createRnTvTransport({ prefixes: lan }).open('ws://192.168.1.23:3000', 1500, {
      pairing: true,
    });
    expect(mockNative.opens[0]?.url).toBe('ws://192.168.1.23:3000');
  });
});

describe('open: URL tricks', () => {
  it.each([
    'ws://192.168.1.5:1@8.8.8.8:3000/',
    'ws://192.168.1.5@8.8.8.8:3000',
    'ws://8.8.8.8\\@192.168.1.5:3000',
    'ws://192.168.1.5:3000/ x',
    'ws://example.com:3000',
  ])('rejects %s as notLocal without calling native', async (url) => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.open(url, 1500, { pairing: true })).rejects.toMatchObject({ code: 'notLocal' });
    expect(mockNative.opens).toHaveLength(0);
  });
});

describe('ssdpSearch', () => {
  it('sends the search to the SSDP group and relays replies until the window ends', async () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
    const t = createRnTvTransport({ prefixes: lan });
    const replies: [string, string][] = [];
    const done = t.ssdpSearch('M-SEARCH', 3000, (text, from) => replies.push([text, from]));
    await jest.advanceTimersByTimeAsync(0);
    const sock = FakeUdp.last;
    expect(sock?.sends[0]).toMatchObject({
      msg: 'M-SEARCH',
      port: 1900,
      address: '239.255.255.250',
    });
    sock?.handlers.get('message')?.(new Uint8Array([72, 105]), { address: '192.168.1.23' });
    sock?.handlers.get('message')?.('plain', { address: '192.168.1.24' });
    sock?.handlers.get('message')?.(42, { address: '192.168.1.25' });
    await jest.advanceTimersByTimeAsync(3000);
    await done;
    expect(replies).toEqual([
      ['Hi', '192.168.1.23'],
      ['plain', '192.168.1.24'],
      ['', '192.168.1.25'],
    ]);
    expect(sock?.closed).toBe(true);
  });

  it('drops replies from addresses that are not on the home network', async () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
    const replies: string[] = [];
    const done = createRnTvTransport({ prefixes: lan }).ssdpSearch('M', 100, (_t, from) =>
      replies.push(from),
    );
    await jest.advanceTimersByTimeAsync(0);
    const sock = FakeUdp.last;
    sock?.handlers.get('message')?.('x', { address: '8.8.8.8' });
    sock?.handlers.get('message')?.('x', { address: '192.168.1.23' });
    await jest.advanceTimersByTimeAsync(100);
    await done;
    expect(replies).toEqual(['192.168.1.23']);
  });

  it('is skipped on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await createRnTvTransport({ prefixes: lan }).ssdpSearch('M-SEARCH', 3000, jest.fn());
    expect(dgram.createSocket).not.toHaveBeenCalled();
  });

  it('rejects notSent when the socket errors or cannot bind', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const t = createRnTvTransport({ prefixes: lan });
    const p = t.ssdpSearch('M-SEARCH', 3000, jest.fn());
    await flush();
    FakeUdp.last?.handlers.get('error')?.(new Error('boom'));
    await expect(p).rejects.toMatchObject({ code: 'notSent' });
    (dgram.createSocket as jest.Mock).mockImplementationOnce(() => {
      const s = new FakeUdp();
      s.bindError = true;
      return s;
    });
    await expect(t.ssdpSearch('M-SEARCH', 3000, jest.fn())).rejects.toMatchObject({
      code: 'notSent',
    });
  });

  it('rejects notSent when the send fails', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    (dgram.createSocket as jest.Mock).mockImplementationOnce(() => {
      const s = new FakeUdp();
      s.sendError = new Error('EPERM');
      return s;
    });
    await expect(
      createRnTvTransport({ prefixes: lan }).ssdpSearch('M-SEARCH', 3000, jest.fn()),
    ).rejects.toMatchObject({ code: 'notSent' });
  });
});

describe('probe', () => {
  it('reports hosts that open, using wss with pairing trust for 3001, and closes every probe socket', async () => {
    mockNative.behave = (o) => {
      if (o.url === 'ws://192.168.1.23:3000' || o.url === 'wss://192.168.1.40:3001') o.resolve({});
      else o.reject(nativeError('ERR_LAN_OPEN_FAILED', 'refused'));
    };
    const opened: [string, number][] = [];
    await createRnTvTransport({ prefixes: lan }).probe([3000, 3001], 1500, (h, p) =>
      opened.push([h, p]),
    );
    expect(opened.sort()).toEqual([
      ['192.168.1.23', 3000],
      ['192.168.1.40', 3001],
    ]);
    expect(mockNative.opens).toHaveLength(253 * 2);
    // Probes run in their own native pool, apart from real connects.
    expect(mockNative.opens.every((o) => o.opts.probe === true)).toBe(true);
    expect(
      mockNative.opens.filter((o) => o.url.startsWith('wss:')).every((o) => o.opts.pairing),
    ).toBe(true);
    expect(
      mockNative.opens.filter((o) => o.url.startsWith('ws:')).every((o) => !o.opts.pairing),
    ).toBe(true);
    const ids = mockNative.opens
      .filter((o) => o.url === 'ws://192.168.1.23:3000' || o.url === 'wss://192.168.1.40:3001')
      .map((o) => o.id);
    expect(mockNative.closed.sort()).toEqual(ids.sort());
    expect(mockNative.opens.some((o) => o.url.includes('192.168.1.7:'))).toBe(false);
  });

  it('keeps 32 hosts in flight and gives up on a silent host after perHostMs', async () => {
    jest.useFakeTimers();
    const opened = jest.fn();
    const done = jest.fn();
    createRnTvTransport({ prefixes: lan }).probe([3000], 1500, opened).then(done);
    await jest.advanceTimersByTimeAsync(0);
    expect(mockNative.opens).toHaveLength(32);
    await jest.advanceTimersByTimeAsync(1500);
    expect(mockNative.opens).toHaveLength(64);
    expect(mockNative.closed).toHaveLength(32);
    await jest.advanceTimersByTimeAsync(20000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(opened).not.toHaveBeenCalled();
    expect(mockNative.opens).toHaveLength(253);
  });

  it('stops sweeping once cancelled', async () => {
    jest.useFakeTimers();
    let cancelled = false;
    const done = jest.fn();
    createRnTvTransport({ prefixes: lan })
      .probe([3000], 1500, jest.fn(), () => cancelled)
      .then(done);
    await jest.advanceTimersByTimeAsync(0);
    expect(mockNative.opens).toHaveLength(32);
    cancelled = true;
    await jest.advanceTimersByTimeAsync(1500);
    expect(mockNative.opens).toHaveLength(32);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('does nothing off Wi-Fi, and survives a native throw', async () => {
    const opened = jest.fn();
    await createRnTvTransport({ prefixes: () => Promise.resolve([]) }).probe([3000], 10, opened);
    expect(mockNative.opens).toHaveLength(0);
    mockNative.throwOnOpen = true;
    await createRnTvTransport({ prefixes: lan }).probe([3000], 10, opened);
    expect(opened).not.toHaveBeenCalled();
  });
});

describe('sendWol', () => {
  it('broadcasts the packet to the subnet broadcast on port 9', async () => {
    const packet = magicPacket('aa:bb:cc:00:11:22');
    await createRnTvTransport({ prefixes: lan }).sendWol(packet);
    const sock = FakeUdp.last;
    expect(sock?.broadcast).toBe(true);
    expect(sock?.sends).toHaveLength(1);
    expect(sock?.sends[0]).toMatchObject({ port: 9, address: '192.168.1.255' });
    expect((sock?.sends[0]?.msg as number[]).length).toBe(102);
    expect(sock?.closed).toBe(true);
  });

  it('rejects notSent off Wi-Fi and when the send fails', async () => {
    await expect(
      createRnTvTransport({ prefixes: () => Promise.resolve([]) }).sendWol(new Uint8Array(1)),
    ).rejects.toMatchObject({ code: 'notSent' });
    (dgram.createSocket as jest.Mock).mockImplementationOnce(() => {
      const s = new FakeUdp();
      s.sendError = new Error('ENETUNREACH');
      return s;
    });
    await expect(
      createRnTvTransport({ prefixes: lan }).sendWol(new Uint8Array(1)),
    ).rejects.toMatchObject({ code: 'notSent' });
  });
});

describe('onWifi', () => {
  it('is true when the phone has an on-link prefix', async () => {
    await expect(createRnTvTransport({ prefixes: lan }).onWifi()).resolves.toBe(true);
    await expect(
      createRnTvTransport({ prefixes: () => Promise.resolve([]) }).onWifi(),
    ).resolves.toBe(false);
  });
});

describe('construction', () => {
  it('opens nothing and loads no native socket module', () => {
    createRnTvTransport();
    expect(dgram.createSocket).not.toHaveBeenCalled();
    expect(lanSocket).not.toHaveBeenCalled();
  });
});
