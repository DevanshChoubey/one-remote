import { DeviceError } from '@/core';
import { buttonFrame, decodeSsap, encodeSsap, URI, type SsapIn } from '@/webos/ssap';
import { createFakeLan } from '@/webos/testing/fakeLan';
import { createFakeTv } from '@/webos/testing/fakeTv';
import type { TvSocket } from '@/webos/transport';

const MAC = 'aa:bb:cc:00:11:22';

async function tick(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function collect(sock: TvSocket): SsapIn[] {
  const got: SsapIn[] = [];
  sock.onMessage((t) => {
    const m = decodeSsap(t);
    if (m) got.push(m);
  });
  return got;
}

const registerFrame = (key?: string): string =>
  encodeSsap({
    type: 'register',
    id: 'r0',
    payload: {
      forcePairing: false,
      pairingType: 'PROMPT',
      ...(key ? { 'client-key': key } : {}),
      manifest: {},
    },
  });

describe('fake TV', () => {
  it('prompts and then registers when allowed', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, prompt: 'allow' });
    const lan = createFakeLan({ tvs: [tv] });
    const sock = await lan.open('ws://192.168.1.23:3000', 1500);
    const got = collect(sock);
    sock.send(registerFrame());
    await tick();
    expect(got[0]).toMatchObject({ type: 'response', payload: { pairingType: 'PROMPT' } });
    expect(got[1]).toMatchObject({
      type: 'registered',
      payload: { 'client-key': expect.any(String) },
    });
  });

  it('answers 403 when denied', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, prompt: 'deny' });
    const lan = createFakeLan({ tvs: [tv] });
    const sock = await lan.open('ws://192.168.1.23:3000', 1500);
    const got = collect(sock);
    sock.send(registerFrame());
    await tick();
    expect(got[1]).toEqual({
      type: 'error',
      id: 'r0',
      error: '403 User denied access',
      payload: {},
    });
  });

  it('registers a known key silently', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, prompt: 'never', knownKeys: ['k1'] });
    const lan = createFakeLan({ tvs: [tv] });
    const sock = await lan.open('ws://192.168.1.23:3000', 1500);
    const got = collect(sock);
    sock.send(registerFrame('k1'));
    await tick();
    expect(got).toEqual([{ type: 'registered', id: 'r0', payload: { 'client-key': 'k1' } }]);
  });

  it('never answers a prompt with "never"', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, prompt: 'never' });
    const lan = createFakeLan({ tvs: [tv] });
    const sock = await lan.open('ws://192.168.1.23:3000', 1500);
    const got = collect(sock);
    sock.send(registerFrame());
    await tick();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: 'response' });
  });

  async function registered(tv: ReturnType<typeof createFakeTv>): Promise<{
    sock: TvSocket;
    got: SsapIn[];
  }> {
    const lan = createFakeLan({ tvs: [tv] });
    const sock = await lan.open(`ws://${tv.host}:3000`, 1500);
    const got = collect(sock);
    sock.send(registerFrame('k'));
    await tick();
    got.length = 0;
    return { sock, got };
  }

  it('records the pointer buttons', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, knownKeys: ['k'] });
    const { sock, got } = await registered(tv);
    sock.send(encodeSsap({ type: 'request', id: 'p1', uri: URI.pointer }));
    await tick();
    const reply = got[0];
    expect(reply).toMatchObject({ type: 'response', id: 'p1' });
    const path = String((reply as { payload?: Record<string, unknown> }).payload?.socketPath);
    expect(path).toBe('ws://192.168.1.23:3000/resources/fake/netinput.pointer.sock');
    const lan = createFakeLan({ tvs: [tv] });
    const pointer = await lan.open(path, 1500);
    pointer.send(buttonFrame('UP'));
    expect(tv.buttons).toEqual(['UP']);
  });

  it('serves volume, power, app and launch points, and pushes subscriptions', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, knownKeys: ['k'] });
    const { sock, got } = await registered(tv);
    sock.send(encodeSsap({ type: 'subscribe', id: 'v', uri: URI.volume }));
    sock.send(encodeSsap({ type: 'subscribe', id: 'f', uri: URI.foreground }));
    sock.send(encodeSsap({ type: 'subscribe', id: 'p', uri: URI.power }));
    sock.send(encodeSsap({ type: 'request', id: 'l', uri: URI.launchPoints }));
    sock.send(encodeSsap({ type: 'request', id: 'n', uri: URI.netInfo }));
    await tick();
    expect(got.map((g) => g.id)).toEqual(['v', 'f', 'p', 'l', 'n']);
    tv.setVolume(21, true);
    tv.setApp('netflix');
    await tick();
    expect(got.filter((g) => g.id === 'v')[1]).toMatchObject({
      payload: { volumeStatus: { volume: 21, muteStatus: true } },
    });
    expect(got.filter((g) => g.id === 'f')[1]).toMatchObject({ payload: { appId: 'netflix' } });
    sock.send(encodeSsap({ type: 'unsubscribe', id: 'v' }));
    await tick();
    tv.setVolume(22);
    await tick();
    expect(got.filter((g) => g.id === 'v')).toHaveLength(2);
    expect(tv.requests.map((r) => r.uri)).toContain(URI.netInfo);
    expect(tv.frames.some((f) => f.type === 'unsubscribe' && f.id === 'v')).toBe(true);
  });

  it('refuses requests before registering and unknown uris', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, knownKeys: ['k'] });
    const lan = createFakeLan({ tvs: [tv] });
    const sock = await lan.open('ws://192.168.1.23:3000', 1500);
    const got = collect(sock);
    sock.send(encodeSsap({ type: 'request', id: 'a', uri: URI.volume }));
    await tick();
    expect(got[0]).toMatchObject({ type: 'error', id: 'a' });
    sock.send(registerFrame('k'));
    sock.send(encodeSsap({ type: 'request', id: 'b', uri: 'ssap://nope' }));
    await tick();
    expect(got[2]).toMatchObject({ type: 'error', id: 'b' });
  });

  it('drops, stops answering and moves', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, knownKeys: ['k'] });
    const { sock, got } = await registered(tv);
    let closed = 0;
    sock.onClose(() => closed++);
    tv.stopAnswering();
    sock.send(encodeSsap({ type: 'request', id: 'a', uri: URI.volume }));
    await tick();
    expect(got).toHaveLength(0);
    tv.moveTo('192.168.1.40');
    expect(closed).toBe(1);
    expect(tv.host).toBe('192.168.1.40');
    const lan = createFakeLan({ tvs: [tv] });
    await expect(lan.open('ws://192.168.1.23:3000', 1500)).rejects.toMatchObject({
      code: 'notSent',
    });
    await expect(lan.open('ws://192.168.1.40:3000', 1500)).resolves.toBeDefined();
    tv.drop();
  });

  it('refuses connections while off and uses wss for secure TVs', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, secure: true });
    const lan = createFakeLan({ tvs: [tv] });
    await expect(lan.open('ws://192.168.1.23:3000', 1500)).rejects.toBeInstanceOf(DeviceError);
    await expect(
      lan.open('wss://192.168.1.23:3001', 1500, { pairing: true }),
    ).resolves.toMatchObject({ certSha256: tv.certSha256 });
    await expect(lan.open('wss://192.168.1.23:3001', 1500)).rejects.toMatchObject({
      code: 'notPaired',
    });
    await expect(
      lan.open('wss://192.168.1.23:3001', 1500, { pinSha256: 'other' }),
    ).rejects.toMatchObject({ code: 'notPaired' });
    tv.setPower(false);
    await expect(
      lan.open('wss://192.168.1.23:3001', 1500, { pairing: true }),
    ).rejects.toMatchObject({
      code: 'notSent',
    });
  });
});

describe('fake LAN', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rejects unknown hosts at once and hung hosts after the timeout', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC });
    const lan = createFakeLan({ tvs: [tv], hang: ['192.168.1.23'] });
    await expect(lan.open('ws://192.168.1.99:3000', 1500)).rejects.toMatchObject({
      code: 'notSent',
    });
    let state = 'pending';
    lan.open('ws://192.168.1.23:3000', 1500).catch((e: DeviceError) => (state = e.code));
    await jest.advanceTimersByTimeAsync(1499);
    expect(state).toBe('pending');
    await jest.advanceTimersByTimeAsync(1);
    expect(state).toBe('notSent');
  });

  it('answers SSDP and the probe, records WoL, and reports wifi', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: MAC, usn: 'uuid:1234' });
    const lan = createFakeLan({ tvs: [tv] });
    const ssdp: [string, string][] = [];
    const done = lan.ssdpSearch('M-SEARCH', 3000, (t, h) => ssdp.push([t, h]));
    await jest.advanceTimersByTimeAsync(3000);
    await done;
    expect(ssdp).toHaveLength(1);
    expect(ssdp[0]?.[1]).toBe('192.168.1.23');
    expect(ssdp[0]?.[0]).toContain('USN: uuid:1234::');
    lan.ssdpEnabled = false;
    const quiet: string[] = [];
    const d2 = lan.ssdpSearch('M-SEARCH', 10, (t) => quiet.push(t));
    await jest.advanceTimersByTimeAsync(10);
    await d2;
    expect(quiet).toEqual([]);
    const opened: [string, number][] = [];
    const d3 = lan.probe([3000, 3001], 1500, (h, p) => opened.push([h, p]));
    await jest.advanceTimersByTimeAsync(1500);
    await d3;
    expect(opened).toEqual([['192.168.1.23', 3000]]);
    await lan.sendWol(new Uint8Array([1, 2]));
    expect(lan.wolPackets).toHaveLength(1);
    expect(await lan.onWifi()).toBe(true);
    lan.wifi = false;
    expect(await lan.onWifi()).toBe(false);
  });
});
