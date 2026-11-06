import { CloudNetError } from '@/miraie/net';
import { allowedHttpsHost, certNamesHost, createCloudNet } from '@/transport/cloud';
import type { FetchLike, RawTls, TlsDialer } from '@/transport/cloud';

interface FakeRaw extends RawTls {
  written: Uint8Array[];
  closed: boolean;
  emitData(b: Uint8Array): void;
  emitClose(): void;
}

function fakeRaw(cn: string | null): FakeRaw {
  let dataCb: ((b: Uint8Array) => void) | undefined;
  let closeCb: (() => void) | undefined;
  const raw: FakeRaw = {
    written: [],
    closed: false,
    peerCommonName: () => Promise.resolve(cn),
    write: (b) => raw.written.push(b),
    close: () => {
      raw.closed = true;
    },
    onData: (cb) => {
      dataCb = cb;
    },
    onClose: (cb) => {
      closeCb = cb;
    },
    emitData: (b) => dataCb?.(b),
    emitClose: () => closeCb?.(),
  };
  return raw;
}

function setup(opts: { cn?: string | null; on?: boolean } = {}) {
  let on = opts.on ?? true;
  const raw = fakeRaw(opts.cn === undefined ? 'mqtt.miraie.in' : opts.cn);
  const dial = jest.fn<ReturnType<TlsDialer>, Parameters<TlsDialer>>(() => Promise.resolve(raw));
  const fetch = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(() =>
    Promise.resolve({ status: 200, text: () => Promise.resolve('{"ok":1}') }),
  );
  const net = createCloudNet({ enabled: () => on, dial, fetch });
  return { net, raw, dial, fetch, setOn: (v: boolean) => (on = v) };
}

const LOGIN = 'https://auth.miraie.in/simplifi/v1/userManagement/login';

describe('cloud transport (MirAIe only)', () => {
  it('allows only https to the exact MirAIe hosts', () => {
    expect(allowedHttpsHost(LOGIN)).toBe('auth.miraie.in');
    expect(allowedHttpsHost('https://APP.miraie.in:443/x')).toBe('app.miraie.in');
    for (const bad of [
      'http://auth.miraie.in/x',
      'https://auth.miraie.in:8443/x',
      'https://evil.com/auth.miraie.in',
      'https://auth.miraie.in.evil.com/x',
      'https://user@auth.miraie.in/x',
      'https://evil.com@auth.miraie.in/x',
      'https://192.168.1.2/x',
      'https://miraie.in/x',
    ]) {
      expect(allowedHttpsHost(bad)).toBeNull();
    }
  });

  it('matches the certificate name exactly or by a single-label wildcard', () => {
    expect(certNamesHost('mqtt.miraie.in', 'mqtt.miraie.in')).toBe(true);
    expect(certNamesHost('*.miraie.in', 'mqtt.miraie.in')).toBe(true);
    expect(certNamesHost('*.in', 'mqtt.miraie.in')).toBe(false);
    expect(certNamesHost('*.evil.com', 'mqtt.miraie.in')).toBe(false);
    expect(certNamesHost('evil.com', 'mqtt.miraie.in')).toBe(false);
    expect(certNamesHost(null, 'mqtt.miraie.in')).toBe(false);
  });

  it('sends nothing at all while the opt-in is off', async () => {
    const { net, fetch, dial } = setup({ on: false });
    await expect(net.request({ method: 'GET', url: LOGIN, timeoutMs: 1000 })).rejects.toMatchObject(
      {
        code: 'off',
      },
    );
    await expect(net.openTls('mqtt.miraie.in', 8883, 1000)).rejects.toMatchObject({ code: 'off' });
    expect(fetch).not.toHaveBeenCalled();
    expect(dial).not.toHaveBeenCalled();
  });

  it('refuses other hosts and ports before dialling', async () => {
    const { net, fetch, dial } = setup();
    await expect(
      net.request({ method: 'GET', url: 'https://example.com/', timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'notAllowed' });
    await expect(net.openTls('example.com', 8883, 1000)).rejects.toMatchObject({
      code: 'notAllowed',
    });
    await expect(net.openTls('mqtt.miraie.in', 1883, 1000)).rejects.toMatchObject({
      code: 'notAllowed',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(dial).not.toHaveBeenCalled();
  });

  it('requests without cookies or redirects and returns the body', async () => {
    const { net, fetch } = setup();
    const res = await net.request({
      method: 'POST',
      url: LOGIN,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      timeoutMs: 1000,
    });
    expect(res).toEqual({ status: 200, body: '{"ok":1}' });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: '{}',
      credentials: 'omit',
      redirect: 'error',
    });
  });

  it('refuses a redirect, an answer from another host and a failure', async () => {
    const { net, fetch } = setup();
    fetch.mockResolvedValueOnce({ status: 302, text: () => Promise.resolve('') });
    await expect(net.request({ method: 'GET', url: LOGIN, timeoutMs: 1000 })).rejects.toMatchObject(
      {
        code: 'failed',
      },
    );
    fetch.mockResolvedValueOnce({
      status: 200,
      url: 'https://evil.com/',
      text: () => Promise.resolve('x'),
    });
    await expect(net.request({ method: 'GET', url: LOGIN, timeoutMs: 1000 })).rejects.toMatchObject(
      {
        code: 'notAllowed',
      },
    );
    fetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(net.request({ method: 'GET', url: LOGIN, timeoutMs: 1000 })).rejects.toEqual(
      expect.any(CloudNetError),
    );
  });

  it('aborts a request that takes too long', async () => {
    jest.useFakeTimers();
    try {
      const { net, fetch } = setup();
      fetch.mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
      const p = net.request({ method: 'GET', url: LOGIN, timeoutMs: 500 });
      const done = expect(p).rejects.toMatchObject({ code: 'failed' });
      jest.advanceTimersByTime(500);
      await done;
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens the broker stream only when the certificate names the broker', async () => {
    const { net, raw } = setup();
    const stream = await net.openTls('mqtt.miraie.in', 8883, 1000);
    const got: Uint8Array[] = [];
    stream.onData((b) => got.push(b));
    raw.emitData(Uint8Array.of(1, 2));
    stream.write(Uint8Array.of(3));
    expect(got).toEqual([Uint8Array.of(1, 2)]);
    expect(raw.written).toEqual([Uint8Array.of(3)]);
    const closed = jest.fn();
    stream.onClose(closed);
    raw.emitClose();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(() => stream.write(Uint8Array.of(4))).toThrow(CloudNetError);
  });

  it('closes a stream with the wrong certificate before writing anything', async () => {
    for (const cn of ['evil.com', null]) {
      const { net, raw } = setup({ cn });
      await expect(net.openTls('mqtt.miraie.in', 8883, 1000)).rejects.toMatchObject({
        code: 'badCertificate',
      });
      expect(raw.closed).toBe(true);
      expect(raw.written).toEqual([]);
    }
  });

  it('drops the stream when the opt-in is turned off while connecting', async () => {
    const { net, raw, dial, setOn } = setup();
    dial.mockImplementationOnce(() => {
      setOn(false);
      return Promise.resolve(raw);
    });
    await expect(net.openTls('mqtt.miraie.in', 8883, 1000)).rejects.toMatchObject({ code: 'off' });
    expect(raw.closed).toBe(true);
  });

  it('maps a dial failure', async () => {
    const { net, dial } = setup();
    dial.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(net.openTls('mqtt.miraie.in', 8883, 1000)).rejects.toMatchObject({
      code: 'failed',
    });
  });
});
