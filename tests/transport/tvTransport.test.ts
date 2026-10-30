import { Platform } from 'react-native';
import dgram from 'react-native-udp';
import { DeviceError } from '@/core';
import type { Prefix } from '@/transport/localOnly';
import { createRnTvTransport } from '@/transport/tvTransport';
import { magicPacket } from '@/webos/wol';

jest.mock('react-native-udp', () => ({ __esModule: true, default: { createSocket: jest.fn() } }));

const LAN: Prefix[] = [{ address: '192.168.1.7', bits: 24 }];
const lan = (): Promise<Prefix[]> => Promise.resolve(LAN);

// --- a fake WebSocket -------------------------------------------------------------------------
class FakeWs {
  static instances: FakeWs[] = [];
  static behave: ((ws: FakeWs) => void) | undefined;
  static throwOnConstruct = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(readonly url: string) {
    if (FakeWs.throwOnConstruct) throw new Error('bad url');
    FakeWs.instances.push(this);
    const behave = FakeWs.behave;
    if (behave) void Promise.resolve().then(() => behave(this));
  }
  send(t: string): void {
    this.sent.push(t);
  }
  close(): void {
    this.closed = true;
  }
}

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
  FakeWs.instances = [];
  FakeWs.behave = undefined;
  FakeWs.throwOnConstruct = false;
  (globalThis as { WebSocket: unknown }).WebSocket = FakeWs;
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
  it('rejects notLocal for a public address and never constructs a WebSocket', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    await expect(t.open('ws://8.8.8.8:3000', 1500)).rejects.toMatchObject({ code: 'notLocal' });
    await expect(t.open('wss://[2001:4860::1]:3001', 1500)).rejects.toMatchObject({
      code: 'notLocal',
    });
    expect(FakeWs.instances).toHaveLength(0);
  });

  it('opens a local socket and relays messages, buffering until a listener exists', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const p = t.open('ws://192.168.1.23:3000', 1500);
    await flush();
    const ws = FakeWs.instances[0];
    expect(ws?.url).toBe('ws://192.168.1.23:3000');
    ws?.onopen?.();
    const sock = await p;
    ws?.onmessage?.({ data: 'early' });
    ws?.onmessage?.({ data: new ArrayBuffer(1) });
    const got: string[] = [];
    sock.onMessage((m) => got.push(m));
    ws?.onmessage?.({ data: 'late' });
    expect(got).toEqual(['early', 'late']);
    sock.send('hello');
    expect(ws?.sent).toEqual(['hello']);
  });

  it('fires onClose for a remote close, not for our own', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    const open = async (): Promise<[FakeWs, Awaited<ReturnType<typeof t.open>>]> => {
      const p = t.open('ws://192.168.1.23:3000', 1500);
      await flush();
      const ws = FakeWs.instances[FakeWs.instances.length - 1] as FakeWs;
      ws.onopen?.();
      return [ws, await p];
    };
    const [ws1, s1] = await open();
    const c1 = jest.fn();
    s1.onClose(c1);
    ws1.onclose?.();
    expect(c1).toHaveBeenCalledTimes(1);
    const [ws2, s2] = await open();
    const c2 = jest.fn();
    s2.onClose(c2);
    s2.close();
    ws2.onclose?.();
    expect(ws2.closed).toBe(true);
    expect(c2).not.toHaveBeenCalled();
  });

  it('rejects notSent on an error, a close before open, and a constructor throw', async () => {
    const t = createRnTvTransport({ prefixes: lan });
    FakeWs.behave = (ws) => ws.onerror?.();
    await expect(t.open('ws://192.168.1.23:3000', 1500)).rejects.toMatchObject({ code: 'notSent' });
    FakeWs.behave = (ws) => ws.onclose?.();
    await expect(t.open('ws://192.168.1.23:3000', 1500)).rejects.toMatchObject({ code: 'notSent' });
    FakeWs.behave = undefined;
    FakeWs.throwOnConstruct = true;
    await expect(t.open('ws://192.168.1.23:3000', 1500)).rejects.toMatchObject({ code: 'notSent' });
  });

  it('rejects notSent after timeoutMs and closes the half-open socket', async () => {
    jest.useFakeTimers();
    const t = createRnTvTransport({ prefixes: lan });
    let err: unknown;
    t.open('ws://192.168.1.23:3000', 1500).catch((e: unknown) => (err = e));
    await jest.advanceTimersByTimeAsync(1499);
    expect(err).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(err).toBeInstanceOf(DeviceError);
    expect((err as DeviceError).code).toBe('notSent');
    expect(FakeWs.instances[0]?.closed).toBe(true);
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
  it('reports hosts that open, using wss for 3001, and closes every probe socket', async () => {
    FakeWs.behave = (ws) => {
      if (ws.url === 'ws://192.168.1.23:3000' || ws.url === 'wss://192.168.1.40:3001')
        ws.onopen?.();
      else ws.onerror?.();
    };
    const opened: [string, number][] = [];
    await createRnTvTransport({ prefixes: lan }).probe([3000, 3001], 1500, (h, p) =>
      opened.push([h, p]),
    );
    expect(opened.sort()).toEqual([
      ['192.168.1.23', 3000],
      ['192.168.1.40', 3001],
    ]);
    expect(FakeWs.instances).toHaveLength(253 * 2);
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
    expect(FakeWs.instances.some((w) => w.url.includes('192.168.1.7:'))).toBe(false);
  });

  it('keeps 32 hosts in flight and gives up on a silent host after perHostMs', async () => {
    jest.useFakeTimers();
    const opened = jest.fn();
    const done = jest.fn();
    createRnTvTransport({ prefixes: lan }).probe([3000], 1500, opened).then(done);
    await jest.advanceTimersByTimeAsync(0);
    expect(FakeWs.instances).toHaveLength(32);
    await jest.advanceTimersByTimeAsync(1500);
    expect(FakeWs.instances).toHaveLength(64);
    await jest.advanceTimersByTimeAsync(20000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(opened).not.toHaveBeenCalled();
    expect(FakeWs.instances).toHaveLength(253);
  });

  it('does nothing off Wi-Fi, and survives a constructor throw', async () => {
    const opened = jest.fn();
    await createRnTvTransport({ prefixes: () => Promise.resolve([]) }).probe([3000], 10, opened);
    expect(FakeWs.instances).toHaveLength(0);
    FakeWs.throwOnConstruct = true;
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
  it('opens nothing', () => {
    createRnTvTransport();
    expect(dgram.createSocket).not.toHaveBeenCalled();
    expect(FakeWs.instances).toHaveLength(0);
  });
});
