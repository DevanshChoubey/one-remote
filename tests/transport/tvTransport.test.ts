import { Platform } from 'react-native';
import dgram from 'react-native-udp';
import { DeviceError } from '@/core';
import type { Prefix } from '@/transport/localOnly';
import { createRnTvTransport } from '@/transport/tvTransport';
import { magicPacket } from '@/tv/wol';
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

interface FakeStreamOpen {
  id: string;
  host: string;
  port: number;
  opts: { pinSha256?: string; pairing?: boolean; identity?: string; timeoutMs: number };
  resolve(r: object): void;
  reject(e: unknown): void;
}

const STREAM_INFO = {
  certSha256: 'ab12',
  serverModulusHex: 'C0FFEE',
  serverExponentHex: '10001',
  serverSubject: 'CN=atvremote/AA:BB:CC:00:11:22',
};

interface FakeRequest {
  req: { method: string; url: string; timeoutMs: number; pinSha256?: string; pairing?: boolean };
  resolve(r: object): void;
  reject(e: unknown): void;
}

class FakeNative {
  requests: FakeRequest[] = [];
  behaveRequest: ((r: FakeRequest) => void) | undefined;
  writeError: Error | undefined;
  sendError: Error | undefined;
  identityCalls: [string, string?][] = [];
  identityResult: object | Error = { modulusHex: 'C0FFEE', exponentHex: '10001' };
  ensureIdentity(ref: string, commonName: string): Promise<object> {
    this.identityCalls.push([ref, commonName]);
    return this.identityResult instanceof Error
      ? Promise.reject(this.identityResult)
      : Promise.resolve(this.identityResult);
  }
  deleteIdentity(ref: string): Promise<void> {
    this.identityCalls.push([ref]);
    return this.identityResult instanceof Error
      ? Promise.reject(this.identityResult)
      : Promise.resolve();
  }
  request(req: FakeRequest['req']): Promise<object> {
    return new Promise((resolve, reject) => {
      const r: FakeRequest = { req, resolve, reject };
      this.requests.push(r);
      const behave = this.behaveRequest;
      if (behave) void Promise.resolve().then(() => behave(r));
    });
  }
  opens: FakeOpen[] = [];
  streamOpens: FakeStreamOpen[] = [];
  sent: [string, string][] = [];
  written: [string, string][] = [];
  closed: string[] = [];
  behave: ((o: FakeOpen) => void) | undefined;
  behaveStream: ((o: FakeStreamOpen) => void) | undefined;
  throwOnOpen = false;
  tcpProbes: [string, number, number][] = [];
  openTcp: (host: string, port: number) => boolean = () => false;
  probeTcp(host: string, port: number, timeoutMs: number): Promise<boolean> {
    this.tcpProbes.push([host, port, timeoutMs]);
    return Promise.resolve(this.openTcp(host, port));
  }
  browses: [string, string][] = [];
  stoppedBrowses: string[] = [];
  private listeners: Record<'message' | 'data' | 'close' | 'service', ((e: never) => void)[]> = {
    message: [],
    data: [],
    close: [],
    service: [],
  };
  browse(id: string, serviceType: string): void {
    this.browses.push([id, serviceType]);
  }
  stopBrowse(id: string): void {
    this.stoppedBrowses.push(id);
  }
  open(id: string, url: string, opts: FakeOpen['opts']): Promise<{ certSha256?: string }> {
    if (this.throwOnOpen) throw new Error('native module missing');
    return new Promise((resolve, reject) => {
      const o: FakeOpen = { id, url, opts, resolve, reject };
      this.opens.push(o);
      const behave = this.behave;
      if (behave) void Promise.resolve().then(() => behave(o));
    });
  }
  openStream(
    id: string,
    host: string,
    port: number,
    opts: FakeStreamOpen['opts'],
  ): Promise<object> {
    return new Promise((resolve, reject) => {
      const o: FakeStreamOpen = { id, host, port, opts, resolve, reject };
      this.streamOpens.push(o);
      const behave = this.behaveStream;
      if (behave) void Promise.resolve().then(() => behave(o));
    });
  }
  send(id: string, text: string): void {
    if (this.sendError) throw this.sendError;
    this.sent.push([id, text]);
  }
  write(id: string, base64: string): void {
    if (this.writeError) throw this.writeError;
    this.written.push([id, base64]);
  }
  close(id: string): void {
    this.closed.push(id);
  }
  addListener(
    event: 'message' | 'data' | 'close' | 'service',
    cb: (e: never) => void,
  ): { remove(): void } {
    this.listeners[event].push(cb);
    return { remove: () => undefined };
  }
  emit(event: 'message' | 'data' | 'close' | 'service', e: object): void {
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
    offset: number | undefined,
    length: number | undefined,
    port: number,
    address: string,
    cb: (e?: Error) => void,
  ): void {
    // As react-native-udp does: an array message takes no offset or length.
    if (Array.isArray(msg) && (offset !== undefined || length !== undefined)) {
      throw new Error('socket.send(): offset and length must be undefined for a msg of type Array');
    }
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

describe('openStream', () => {
  it('refuses a non-local host, and no pin outside pairing, without calling native', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.openStream('8.8.8.8', 6467, 1500, { pairing: true })).rejects.toMatchObject({
      code: 'notLocal',
    });
    await expect(t.openStream('192.168.1.23', 6467, 1500, {})).rejects.toMatchObject({
      code: 'notPaired',
    });
    expect(mockNative.streamOpens).toHaveLength(0);
  });

  it('passes the trust and identity to native and reports the server certificate', async () => {
    mockNative.behaveStream = (o) => o.resolve(STREAM_INFO);
    const t = createRnTvTransport({ prefixes: lan });
    const s = await t.openStream('192.168.1.23', 6467, 1500, {
      pairing: true,
      identity: 'androidtv:tv1',
    });
    const o = mockNative.streamOpens[0] as FakeStreamOpen;
    expect([o.host, o.port]).toEqual(['192.168.1.23', 6467]);
    expect(o.opts).toEqual({ timeoutMs: 1500, pairing: true, identity: 'androidtv:tv1' });
    expect(s).toMatchObject(STREAM_INFO);
    await t.openStream('192.168.1.23', 6466, 1500, { pinSha256: 'ab12' });
    expect(mockNative.streamOpens[1]?.opts).toEqual({ timeoutMs: 1500, pinSha256: 'ab12' });
  });

  it('maps the native codes as open does', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const cases: [string, string][] = [
      ['ERR_LAN_PIN_MISMATCH', 'notPaired'],
      ['ERR_LAN_NO_TRUST', 'notPaired'],
      ['ERR_LAN_NOT_LOCAL', 'notLocal'],
      ['ERR_LAN_OPEN_FAILED', 'notSent'],
    ];
    for (const [code, want] of cases) {
      mockNative.behaveStream = (o) => o.reject(nativeError(code, 'native says no'));
      const err = await t
        .openStream('192.168.1.23', 6467, 1500, { pinSha256: 'ab' })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DeviceError);
      expect(err).toMatchObject({ code: want });
      expect((err as Error).message).toContain('native says no');
      expect((err as Error).message).toContain('192.168.1.23:6467');
    }
  });

  it('base64-encodes writes and decodes data, buffering until a listener exists', async () => {
    mockNative.behaveStream = (o) => o.resolve(STREAM_INFO);
    const s = await createRnTvTransport({ prefixes: lan }).openStream('192.168.1.23', 6467, 1500, {
      pairing: true,
    });
    const id = mockNative.streamOpens[0]?.id as string;
    s.write(new Uint8Array([0, 1, 2, 250, 255]));
    s.write(new Uint8Array([104, 105]));
    expect(mockNative.written).toEqual([
      [id, 'AAEC+v8='],
      [id, 'aGk='],
    ]);
    mockNative.emit('data', { id, base64: 'AAEC+v8=' });
    mockNative.emit('data', { id: 'someone-else', base64: 'aGk=' });
    const got: number[][] = [];
    s.onData((b) => got.push([...b]));
    mockNative.emit('data', { id, base64: 'aGk=' });
    mockNative.emit('data', { id, base64: '' });
    expect(got).toEqual([[0, 1, 2, 250, 255], [104, 105], []]);
  });

  it('fires onClose once for a remote close, not for our own, and refuses writes after', async () => {
    mockNative.behaveStream = (o) => o.resolve(STREAM_INFO);
    const t = createRnTvTransport({ prefixes: lan });
    const s1 = await t.openStream('192.168.1.23', 6467, 1500, { pairing: true });
    const id1 = mockNative.streamOpens[0]?.id as string;
    const c1 = jest.fn();
    s1.onClose(c1);
    mockNative.emit('close', { id: id1, error: 'reset' });
    mockNative.emit('close', { id: id1, error: 'again' });
    expect(c1).toHaveBeenCalledTimes(1);
    expect(() => s1.write(new Uint8Array([1]))).toThrow(DeviceError);
    const s2 = await t.openStream('192.168.1.23', 6467, 1500, { pairing: true });
    const id2 = mockNative.streamOpens[1]?.id as string;
    const c2 = jest.fn();
    s2.onClose(c2);
    s2.close();
    s2.close();
    expect(mockNative.closed).toEqual([id2]);
    mockNative.emit('close', { id: id2, error: 'late' });
    expect(c2).not.toHaveBeenCalled();
  });

  it('rejects notSent after timeoutMs and closes a late stream', async () => {
    jest.useFakeTimers();
    const t = createRnTvTransport({ prefixes: lan });
    let err: unknown;
    t.openStream('192.168.1.23', 6467, 1500, { pairing: true }).catch((e: unknown) => (err = e));
    await jest.advanceTimersByTimeAsync(1500);
    expect(err).toMatchObject({ code: 'notSent' });
    const o = mockNative.streamOpens[0] as FakeStreamOpen;
    expect(mockNative.closed).toEqual([o.id]);
    o.resolve(STREAM_INFO);
    await jest.advanceTimersByTimeAsync(0);
    expect(mockNative.closed).toEqual([o.id, o.id]);
  });
});

describe('request', () => {
  const RESPONSE = { status: 200, headers: { 'x-a': 'b' }, body: 'hi', certSha256: 'ab12' };

  it('refuses a non-local host, and https without a pin outside pairing, without calling native', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(
      t.request({ method: 'GET', url: 'http://8.8.8.8/', timeoutMs: 1500 }),
    ).rejects.toMatchObject({ code: 'notLocal' });
    await expect(
      t.request({ method: 'GET', url: 'https://192.168.1.23/', timeoutMs: 1500 }),
    ).rejects.toMatchObject({ code: 'notPaired' });
    await expect(
      t.request({ method: 'GET', url: 'ftp://192.168.1.23/', timeoutMs: 1500 }),
    ).rejects.toMatchObject({ code: 'notLocal' });
    expect(mockNative.requests).toHaveLength(0);
  });

  it('passes the request to native and returns the response', async () => {
    mockNative.behaveRequest = (r) => r.resolve(RESPONSE);
    const t = createRnTvTransport({ prefixes: lan });
    const res = await t.request({
      method: 'POST',
      url: 'https://192.168.1.23:8002/x',
      body: 'b',
      pairing: true,
      timeoutMs: 1500,
    });
    expect(res).toEqual(RESPONSE);
    expect(mockNative.requests[0]?.req).toEqual({
      method: 'POST',
      url: 'https://192.168.1.23:8002/x',
      body: 'b',
      pairing: true,
      timeoutMs: 1500,
    });
  });

  it('maps the native codes as open does', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const cases: [string, string][] = [
      ['ERR_LAN_PIN_MISMATCH', 'notPaired'],
      ['ERR_LAN_NO_TRUST', 'notPaired'],
      ['ERR_LAN_NOT_LOCAL', 'notLocal'],
      ['ERR_LAN_OPEN_FAILED', 'notSent'],
    ];
    for (const [code, want] of cases) {
      mockNative.behaveRequest = (r) => r.reject(nativeError(code, 'native says no'));
      const err = await t
        .request({ method: 'GET', url: 'https://192.168.1.23/', pinSha256: 'ab', timeoutMs: 1500 })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DeviceError);
      expect(err).toMatchObject({ code: want });
      expect((err as Error).message).toContain('native says no');
    }
  });

  it('rejects an invalid maxBytes without calling native', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    for (const maxBytes of [NaN, 0, 1.5, Infinity, 64 * 1024 * 1024 + 1]) {
      await expect(
        t.request({ method: 'GET', url: 'http://192.168.1.23/', timeoutMs: 1500, maxBytes }),
      ).rejects.toMatchObject({ code: 'notSent' });
    }
    mockNative.behaveRequest = (r) => r.resolve(RESPONSE);
    await t.request({
      method: 'GET',
      url: 'http://192.168.1.23/',
      timeoutMs: 1500,
      maxBytes: 64 * 1024 * 1024,
    });
    expect(mockNative.requests).toHaveLength(1);
  });

  it('rejects notSent when the native module throws', async () => {
    mockNative.request = () => {
      throw new Error('native module missing');
    };
    await expect(
      createRnTvTransport({ prefixes: lan }).request({
        method: 'GET',
        url: 'http://192.168.1.23/',
        timeoutMs: 1500,
      }),
    ).rejects.toMatchObject({ code: 'notSent' });
  });
});

describe('late close and failed writes', () => {
  it('stream: a close that arrives before the open resolves still reaches onClose, deferred', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    let resolveOpen: ((r: object) => void) | undefined;
    mockNative.behaveStream = (o) => (resolveOpen = o.resolve);
    const p = t.openStream('192.168.1.23', 6467, 1500, { pairing: true });
    await flush();
    const id = mockNative.streamOpens[0]?.id as string;
    mockNative.emit('close', { id, error: 'reset' });
    resolveOpen?.(STREAM_INFO);
    const s = await p;
    const cb = jest.fn();
    s.onClose(cb);
    expect(cb).not.toHaveBeenCalled();
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stream: onClose after our own close is never called', async () => {
    mockNative.behaveStream = (o) => o.resolve(STREAM_INFO);
    const s = await createRnTvTransport({ prefixes: lan }).openStream('192.168.1.23', 6467, 1500, {
      pairing: true,
    });
    const id = mockNative.streamOpens[0]?.id as string;
    s.close();
    mockNative.emit('close', { id, error: 'late' });
    const cb = jest.fn();
    s.onClose(cb);
    await flush();
    expect(cb).not.toHaveBeenCalled();
  });

  it('socket: a close that arrives before the open resolves still reaches onClose, deferred', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    let resolveOpen: ((r: object) => void) | undefined;
    mockNative.behave = (o) => (resolveOpen = o.resolve);
    const p = t.open('ws://192.168.1.23:3000', 1500);
    await flush();
    const id = mockNative.opens[0]?.id as string;
    mockNative.emit('close', { id, error: 'reset' });
    resolveOpen?.({});
    const s = await p;
    const cb = jest.fn();
    s.onClose(cb);
    expect(cb).not.toHaveBeenCalled();
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stream: onClose then close() in the same tick never calls the callback', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    let resolveOpen: ((r: object) => void) | undefined;
    mockNative.behaveStream = (o) => (resolveOpen = o.resolve);
    const p = t.openStream('192.168.1.23', 6467, 1500, { pairing: true });
    await flush();
    mockNative.emit('close', { id: mockNative.streamOpens[0]?.id as string, error: 'reset' });
    resolveOpen?.(STREAM_INFO);
    const s = await p;
    const cb = jest.fn();
    s.onClose(cb);
    s.close();
    await flush();
    expect(cb).not.toHaveBeenCalled();
  });

  it('socket: onClose then close() in the same tick never calls the callback', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    let resolveOpen: ((r: object) => void) | undefined;
    mockNative.behave = (o) => (resolveOpen = o.resolve);
    const p = t.open('ws://192.168.1.23:3000', 1500);
    await flush();
    mockNative.emit('close', { id: mockNative.opens[0]?.id as string, error: 'reset' });
    resolveOpen?.({});
    const s = await p;
    const cb = jest.fn();
    s.onClose(cb);
    s.close();
    await flush();
    expect(cb).not.toHaveBeenCalled();
  });

  it('socket send: a native error becomes notSent', async () => {
    mockNative.behave = (o) => o.resolve({});
    const s = await createRnTvTransport({ prefixes: lan }).open('ws://192.168.1.23:3000', 1500);
    mockNative.sendError = nativeError('ERR_LAN_OPEN_FAILED', 'The socket is not open');
    let err: unknown;
    try {
      s.send('x');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DeviceError);
    expect(err).toMatchObject({ code: 'notSent' });
  });

  it('stream write: a native error becomes notSent', async () => {
    mockNative.behaveStream = (o) => o.resolve(STREAM_INFO);
    const s = await createRnTvTransport({ prefixes: lan }).openStream('192.168.1.23', 6467, 1500, {
      pairing: true,
    });
    mockNative.writeError = nativeError('ERR_LAN_OPEN_FAILED', 'The stream is not open');
    let err: unknown;
    try {
      s.write(new Uint8Array([1]));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DeviceError);
    expect(err).toMatchObject({ code: 'notSent' });
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

  it('checks non-LG ports with a plain TCP connect and keeps the WebSocket check for 3000', async () => {
    mockNative.behave = (o) => {
      if (o.url === 'ws://192.168.1.23:3000') o.resolve({});
      else o.reject(nativeError('ERR_LAN_OPEN_FAILED', 'refused'));
    };
    mockNative.openTcp = (h, p) => h === '192.168.1.50' && p === 6466;
    const opened: [string, number][] = [];
    const hosts: [string, number[]][] = [];
    await createRnTvTransport({ prefixes: lan }).probe(
      [3000, 6466, 8002],
      1500,
      (h, p) => opened.push([h, p]),
      undefined,
      (h, ps) => hosts.push([h, ps]),
    );
    expect(opened.sort()).toEqual([
      ['192.168.1.23', 3000],
      ['192.168.1.50', 6466],
    ]);
    expect(hosts.sort()).toEqual([
      ['192.168.1.23', [3000]],
      ['192.168.1.50', [6466]],
    ]);
    expect(mockNative.tcpProbes).toHaveLength(253 * 2);
    expect(
      mockNative.tcpProbes.every(([, p, ms]) => (p === 6466 || p === 8002) && ms === 1500),
    ).toBe(true);
    // Only the LG port opens a WebSocket.
    expect(mockNative.opens).toHaveLength(253);
    expect(mockNative.opens.every((o) => o.url.endsWith(':3000'))).toBe(true);
  });

  it('calls onHost once per host with its open ports, before the sweep ends', async () => {
    mockNative.behave = (o) => {
      if (o.url.endsWith(':3000') && o.url.includes('.23:')) o.resolve({});
      else if (o.url === 'wss://192.168.1.23:3001' || o.url === 'wss://192.168.1.40:3001')
        o.resolve({});
      else o.reject(nativeError('ERR_LAN_OPEN_FAILED', 'refused'));
    };
    const hosts: [string, number[]][] = [];
    await createRnTvTransport({ prefixes: lan }).probe(
      [3000, 3001],
      1500,
      jest.fn(),
      undefined,
      (h, ports) => hosts.push([h, ports]),
    );
    expect(hosts.sort()).toEqual([
      ['192.168.1.23', [3000, 3001]],
      ['192.168.1.40', [3001]],
    ]);
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

describe('mdnsBrowse', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("relays this browse's services, ignores other ids, and stops after the window", async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const seen: object[] = [];
    const done = t.mdnsBrowse('_androidtvremote2._tcp', 5000, (s) => seen.push(s));
    await jest.advanceTimersByTimeAsync(0);
    const [id, type] = mockNative.browses[0] as [string, string];
    expect(type).toBe('_androidtvremote2._tcp');
    mockNative.emit('service', {
      id,
      name: 'Living room',
      host: '192.168.1.40',
      port: 6466,
      txt: { bt: 'AA:BB' },
    });
    mockNative.emit('service', {
      id: 'someone-else',
      name: 'Stray',
      host: '192.168.1.41',
      port: 1,
      txt: {},
    });
    expect(mockNative.stoppedBrowses).toEqual([]);
    await jest.advanceTimersByTimeAsync(5000);
    await done;
    expect(seen).toEqual([
      { name: 'Living room', host: '192.168.1.40', port: 6466, txt: { bt: 'AA:BB' } },
    ]);
    expect(mockNative.stoppedBrowses).toEqual([id]);
    mockNative.emit('service', { id, name: 'Late', host: '192.168.1.42', port: 1, txt: {} });
    expect(seen).toHaveLength(1);
  });

  it('stops once even when the promise is awaited twice', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const p = t.mdnsBrowse('_x._tcp', 100, () => undefined);
    await jest.advanceTimersByTimeAsync(100);
    await p;
    await p;
    expect(mockNative.stoppedBrowses).toHaveLength(1);
  });

  it('rejects notSent and stops when the native browse throws', async () => {
    mockNative.browse = () => {
      throw new Error('native module missing');
    };
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.mdnsBrowse('_x._tcp', 100, () => undefined)).rejects.toMatchObject({
      code: 'notSent',
    });
    expect(mockNative.stoppedBrowses).toHaveLength(1);
  });

  it('rejects notSent when the native module cannot be loaded', async () => {
    const t = createRnTvTransport({
      prefixes: lan,
      lan: () => {
        throw new Error('native module missing');
      },
    });
    await expect(t.mdnsBrowse('_x._tcp', 100, () => undefined)).rejects.toMatchObject({
      code: 'notSent',
    });
  });

  it('drops service events whose host is not local', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const seen: string[] = [];
    const done = t.mdnsBrowse('_x._tcp', 100, (s) => seen.push(s.host));
    await jest.advanceTimersByTimeAsync(0);
    const id = mockNative.browses[0]?.[0] as string;
    for (const host of ['8.8.8.8', 'example.com', '192.168.1.50']) {
      mockNative.emit('service', { id, name: 'n', host, port: 1, txt: {} });
    }
    await jest.advanceTimersByTimeAsync(100);
    await done;
    expect(seen).toEqual(['192.168.1.50']);
  });
});

describe('client identity', () => {
  it('ensureIdentity passes the ref and common name through and returns the public key', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.ensureIdentity('androidtv:tv1', 'one-remote')).resolves.toEqual({
      modulusHex: 'C0FFEE',
      exponentHex: '10001',
    });
    expect(mockNative.identityCalls).toEqual([['androidtv:tv1', 'one-remote']]);
  });

  it('deleteIdentity passes the ref through', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.deleteIdentity('androidtv:tv1')).resolves.toBeUndefined();
    expect(mockNative.identityCalls).toEqual([['androidtv:tv1']]);
  });

  it('maps native failures to DeviceError and keeps the native text', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    mockNative.identityResult = nativeError('ERR_LAN_OPEN_FAILED', 'Keystore is locked');
    await expect(t.ensureIdentity('a', 'cn')).rejects.toMatchObject({
      name: 'DeviceError',
      code: 'notSent',
      message: expect.stringContaining('Keystore is locked'),
    });
    await expect(t.deleteIdentity('a')).rejects.toMatchObject({ code: 'notSent' });
  });

  it('maps a missing native module to notSent', async () => {
    const t = createRnTvTransport({
      prefixes: lan,
      lan: () => {
        throw new Error('native module missing');
      },
    });
    await expect(t.ensureIdentity('a', 'cn')).rejects.toMatchObject({ code: 'notSent' });
  });
});
