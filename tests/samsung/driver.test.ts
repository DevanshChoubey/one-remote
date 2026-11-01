import type { Command, Device, Link, Reported, TvKey } from '@/core';
import { createSamsungDriver, type SamsungDriverOpts } from '@/samsung/driver';
import { KEY_NAME } from '@/samsung/keys';
import { createFakeSamsungLan, type FakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv, type FakeSamsungTv } from '@/samsung/testing/fakeTv';
import type { TvSecretsWithDelete } from '@/tv/transport';
import { magicPacket } from '@/tv/wol';

const HOST = '192.168.1.40';
const NEW_HOST = '192.168.1.99';
const MAC = 'aa:bb:cc:dd:ee:ff';
const REF = 'samsung:abc';
const TOKEN = '12345678';

type SamsungLink = Extract<Link, { kind: 'samsung' }>;

function samsung(over: Partial<SamsungLink> = {}): SamsungLink {
  return {
    kind: 'samsung',
    host: HOST,
    mac: MAC,
    tokenRef: REF,
    pinSha256: `cert-${MAC.replace(/:/g, '')}`,
    ...over,
  };
}

function device(links: Link[], id = 'tv1'): Device {
  return { id, kind: 'tv', name: 'TV', roomId: 'r1', order: 0, links };
}

function secrets(seed: Record<string, string> = { [REF]: TOKEN }) {
  const map = new Map(Object.entries(seed));
  const s: TvSecretsWithDelete & { map: Map<string, string> } = {
    map,
    get: (ref) => Promise.resolve(map.get(ref) ?? null),
    set: (ref, v) => {
      map.set(ref, v);
      return Promise.resolve();
    },
    delete: (ref) => {
      map.delete(ref);
      return Promise.resolve();
    },
  };
  return s;
}

async function advance(ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
}

interface Rig {
  tv: FakeSamsungTv;
  lan: FakeSamsungLan;
  secrets: ReturnType<typeof secrets>;
  driver: ReturnType<typeof createSamsungDriver>;
  onHostChanged: jest.Mock;
  dev: Device;
  link: SamsungLink;
  send(cmd: Command, signal?: AbortSignal): Promise<void>;
  key(key: TvKey): Promise<void>;
  observe(): { reports: Reported[]; stop: () => void };
}

function rig(
  o: {
    tv?: Partial<Parameters<typeof createFakeSamsungTv>[0]>;
    link?: Partial<SamsungLink>;
    seed?: Record<string, string>;
    driver?: Partial<SamsungDriverOpts>;
    extraLinks?: Link[];
  } = {},
): Rig {
  const tv = createFakeSamsungTv({ host: HOST, mac: MAC, ...o.tv });
  const lan = createFakeSamsungLan([tv]);
  const s = secrets(o.seed);
  const onHostChanged = jest.fn(() => Promise.resolve());
  const driver = createSamsungDriver({
    transport: lan,
    secrets: s,
    onHostChanged,
    ...o.driver,
  });
  const link = samsung(o.link);
  const dev = device([link, ...(o.extraLinks ?? [])]);
  const send = (cmd: Command, signal?: AbortSignal) => driver.send(dev, link, cmd, signal);
  return {
    tv,
    lan,
    secrets: s,
    driver,
    onHostChanged,
    dev,
    link,
    send,
    key: (key) => send({ kind: 'tv.key', key }),
    observe: () => {
      const reports: Reported[] = [];
      const stop = driver.observe?.(dev, link, (r) => reports.push(r)) ?? (() => undefined);
      return { reports, stop };
    },
  };
}

const powers = (reports: Reported[]): boolean[] =>
  reports.map((r) => (r.kind === 'tv' ? r.state.power : false));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('supports and capabilities', () => {
  it('key and text true, input false, powerOn follows MAC and ir', () => {
    const r = rig();
    const d = r.driver;
    expect(d.supports(r.dev, r.link, { kind: 'tv.key', key: 'up' })).toBe(true);
    expect(d.supports(r.dev, r.link, { kind: 'tv.text', text: 'x' })).toBe(true);
    expect(d.supports(r.dev, r.link, { kind: 'tv.input', inputId: 'HDMI_1' })).toBe(false);
    expect(d.supports(r.dev, r.link, { kind: 'tv.powerOn' })).toBe(true);
    const noMac = samsung({ mac: undefined });
    expect(d.supports(device([noMac]), noMac, { kind: 'tv.powerOn' })).toBe(false);
    const withIr = device([r.link, { kind: 'ir', remoteId: 'x' }]);
    expect(d.supports(withIr, r.link, { kind: 'tv.powerOn' })).toBe(false);
    const webos: Link = { kind: 'webos', host: HOST, secure: false, clientKeyRef: 'k' };
    expect(d.supports(device([webos]), webos, { kind: 'tv.key', key: 'up' })).toBe(false);
  });

  it('capabilities', () => {
    const r = rig();
    expect(r.driver.capabilities(r.dev, r.link)).toEqual({
      tv: { inputList: false, text: true, powerOn: true },
    });
    const noMac = samsung({ mac: undefined });
    expect(r.driver.capabilities(device([noMac]), noMac)).toEqual({
      tv: { inputList: false, text: true, powerOn: false },
    });
    const ir = device([noMac, { kind: 'ir', remoteId: 'x' }]);
    expect(r.driver.capabilities(ir, noMac).tv?.powerOn).toBe(true);
  });
});

describe('keys and text', () => {
  const KEYS = Object.keys(KEY_NAME) as Exclude<TvKey, 'playPause'>[];

  it.each(KEYS)('%s arrives as its KEY_ name', async (k) => {
    const r = rig();
    await r.key(k);
    expect(r.tv.keys).toEqual([KEY_NAME[k]]);
  });

  it('playPause alternates pause and play', async () => {
    const r = rig();
    await r.key('playPause');
    await r.key('playPause');
    await r.key('playPause');
    expect(r.tv.keys).toEqual(['KEY_PAUSE', 'KEY_PLAY', 'KEY_PAUSE']);
  });

  it('types UTF-8 text', async () => {
    const r = rig();
    await r.send({ kind: 'tv.text', text: 'नमस्ते 🙂' });
    await r.send({ kind: 'tv.text', text: '' });
    expect(r.tv.texts).toEqual(['नमस्ते 🙂', '']);
  });

  it('no token in secrets is notPaired and opens nothing', async () => {
    const r = rig({ seed: {} });
    await expect(r.key('up')).rejects.toMatchObject({ code: 'notPaired' });
    expect(r.lan.opened).toEqual([]);
  });

  it('two presses use one socket, closed idleCloseMs after the last', async () => {
    const r = rig();
    await r.key('up');
    await r.key('down');
    expect(r.tv.connections()).toBe(1);
    expect(r.lan.opened).toHaveLength(1);
    await advance(9999);
    expect(r.tv.connections()).toBe(1);
    await advance(1);
    expect(r.tv.connections()).toBe(0);
  });

  it('a quiet TV (no token sent) is notSent within connectMs and nothing is written', async () => {
    const r = rig({ seed: { [REF]: '' } });
    r.tv.stayQuiet(true);
    const p = r.key('up').catch((e: unknown) => e);
    await advance(1500);
    await expect(p).resolves.toMatchObject({ code: 'notSent' });
    expect(r.tv.keys).toEqual([]);
    expect(r.tv.connections()).toBe(0);
  });

  it('an aborted signal writes nothing', async () => {
    const r = rig();
    const ac = new AbortController();
    ac.abort();
    await expect(r.send({ kind: 'tv.key', key: 'up' }, ac.signal)).rejects.toMatchObject({
      code: 'notSent',
    });
    expect(r.tv.keys).toEqual([]);
    expect(r.lan.opened).toEqual([]);
  });

  it('an abort during connect writes nothing', async () => {
    const r = rig({ tv: { prompt: 'manual' } });
    r.tv.revokeToken();
    const ac = new AbortController();
    const p = r.send({ kind: 'tv.key', key: 'up' }, ac.signal).catch((e: unknown) => e);
    await advance(10);
    ac.abort();
    r.tv.allow();
    await advance(10);
    await expect(p).resolves.toMatchObject({ code: 'notSent' });
    expect(r.tv.keys).toEqual([]);
  });
});

describe('token revoked', () => {
  it('says Pair again once, then stays quiet until clearNotPaired', async () => {
    const r = rig();
    r.tv.revokeToken();
    const first = r.key('up').catch((e: unknown) => e);
    await advance(10);
    r.tv.deny();
    await expect(first).resolves.toMatchObject({ code: 'notPaired' });
    const opened = r.lan.opened.length;
    await expect(r.key('up')).rejects.toMatchObject({ code: 'notPaired' });
    await expect(r.key('up')).rejects.toMatchObject({ code: 'notPaired' });
    expect(r.lan.opened.length).toBe(opened);
  });

  it('an unanswered prompt after a stored token is notPaired, and the socket is not reopened', async () => {
    const r = rig();
    r.tv.revokeToken();
    r.tv.stayQuiet(true);
    const first = r.key('up').catch((e: unknown) => e);
    await advance(1500);
    await expect(first).resolves.toMatchObject({ code: 'notPaired' });
    const opened = r.lan.opened.length;
    await expect(r.key('up')).rejects.toMatchObject({ code: 'notPaired' });
    expect(r.lan.opened.length).toBe(opened);
    expect(r.tv.connections()).toBe(0);
  });

  it('writes a rotated token back to secrets', async () => {
    const r = rig({ tv: { token: 'newtok', prompt: 'allow' }, seed: { [REF]: 'old' } });
    await r.key('up');
    expect(r.secrets.map.get(REF)).toBe('newtok');
    expect(r.tv.keys).toEqual(['KEY_UP']);
  });

  it('works again after clearNotPaired with a fresh token', async () => {
    const r = rig({ tv: { token: 'abcd' }, seed: { [REF]: 'abcd' } });
    r.tv.revokeToken();
    const first = r.key('up').catch((e: unknown) => e);
    await advance(10);
    r.tv.deny();
    await first;
    // Re-paired elsewhere: the TV accepts 'abcd' again.
    r.tv.allow();
    r.driver.clearNotPaired('tv1', r.link);
    await r.key('up');
    expect(r.tv.keys).toEqual(['KEY_UP']);
  });
});

describe('power on', () => {
  it('sends the magic packet', async () => {
    const r = rig();
    await r.send({ kind: 'tv.powerOn' });
    expect(r.lan.wol[0]).toEqual(magicPacket(MAC));
    expect(r.lan.opened).toEqual([]);
  });

  it('no MAC is unsupported', async () => {
    const r = rig({ link: { mac: undefined } });
    await expect(
      r.driver.send(device([samsung({ mac: undefined })]), samsung({ mac: undefined }), {
        kind: 'tv.powerOn',
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('a WoL failure is notSent', async () => {
    const r = rig();
    r.lan.sendWol = () => Promise.reject(new Error('no route'));
    await expect(r.send({ kind: 'tv.powerOn' })).rejects.toMatchObject({ code: 'notSent' });
  });
});

describe('observe', () => {
  it('reports on from the first poll, repeats every pollMs, emits changes only', async () => {
    const r = rig();
    const o = r.observe();
    await advance(1);
    expect(powers(o.reports)).toEqual([true]);
    expect(r.tv.infoRequests()).toBe(1);
    await advance(5000);
    expect(r.tv.infoRequests()).toBe(2);
    await advance(5000);
    expect(r.tv.infoRequests()).toBe(3);
    expect(powers(o.reports)).toEqual([true]);
    o.stop();
  });

  it('standby is off and opens no socket; standby then on is on again', async () => {
    const r = rig();
    r.tv.setPower('standby');
    const o = r.observe();
    await advance(1);
    expect(powers(o.reports)).toEqual([false]);
    await advance(20000);
    expect(r.lan.opened).toEqual([]);
    r.tv.setPower('on');
    await advance(5000);
    expect(powers(o.reports)).toEqual([false, true]);
    o.stop();
  });

  it('a second observer gets the last state at once', async () => {
    const r = rig();
    const a = r.observe();
    await advance(1);
    const b = r.observe();
    expect(powers(b.reports)).toEqual([true]);
    a.stop();
    b.stop();
  });

  it('stops polling when the last observer leaves', async () => {
    const r = rig();
    const a = r.observe();
    await advance(1);
    a.stop();
    const n = r.tv.infoRequests();
    await advance(30000);
    expect(r.tv.infoRequests()).toBe(n);
  });

  it('two failed polls report off; with the phone off Wi-Fi they report nothing', async () => {
    const r = rig();
    const o = r.observe();
    await advance(1);
    r.tv.setPower('off');
    await advance(5000);
    expect(powers(o.reports)).toEqual([true]);
    await advance(5000);
    expect(powers(o.reports)).toEqual([true, false]);
    o.stop();

    const q = rig();
    q.lan.onWifiResult = false;
    q.tv.setPower('off');
    const p = q.observe();
    await advance(20000);
    expect(p.reports).toEqual([]);
    p.stop();
  });

  it('keeps a warm socket and reconnects on the first backoff step after a drop', async () => {
    const r = rig();
    const o = r.observe();
    await advance(10);
    expect(r.tv.connections()).toBe(1);
    r.tv.drop();
    expect(r.tv.connections()).toBe(0);
    await advance(249);
    expect(r.tv.connections()).toBe(0);
    await advance(2);
    expect(r.tv.connections()).toBe(1);
    o.stop();
  });

  it('stops reconnecting after the backoff is spent; a press connects once', async () => {
    const r = rig();
    const o = r.observe();
    await advance(10);
    // The TV answers the info page but refuses sockets from now on.
    r.lan.open = (url) => {
      r.lan.opened.push(url);
      return Promise.reject(Object.assign(new Error('refused'), { code: 'notSent' }));
    };
    r.tv.drop();
    await advance(20000);
    const spent = r.lan.opened.length;
    // 1 initial + 5 backoff steps.
    expect(spent).toBe(1 + 5);
    await advance(30000);
    expect(r.lan.opened.length).toBe(spent);
    o.stop();
  });

  it('never reconnects while notPaired', async () => {
    const r = rig();
    r.tv.revokeToken();
    const o = r.observe();
    await advance(10);
    r.tv.deny();
    await advance(20000);
    expect(r.lan.opened).toHaveLength(1);
    o.stop();
  });
});

describe('rediscovery', () => {
  it('finds a moved TV once, at most every 30 s', async () => {
    const r = rig();
    const o = r.observe();
    await advance(10);
    r.tv.moveTo(NEW_HOST);
    await advance(10000);
    await advance(10000);
    await advance(10000);
    expect(r.onHostChanged).toHaveBeenCalledTimes(1);
    expect(r.onHostChanged).toHaveBeenCalledWith('tv1', NEW_HOST);
    expect(powers(o.reports).at(-1)).toBe(true);
    o.stop();
  });

  it('searches no more than once per 30 s while nothing is found', async () => {
    const r = rig();
    const o = r.observe();
    await advance(10);
    r.tv.setPower('off');
    await advance(25000);
    expect(r.lan.probes.length).toBe(1);
    await advance(30000);
    expect(r.lan.probes.length).toBe(2);
    o.stop();
  });

  it('never adopts another TV at the old address', async () => {
    const r = rig();
    const other = createFakeSamsungTv({ host: NEW_HOST, mac: '11:22:33:44:55:66' });
    const lan = createFakeSamsungLan([r.tv, other]);
    const onHostChanged = jest.fn(() => Promise.resolve());
    const driver = createSamsungDriver({ transport: lan, secrets: r.secrets, onHostChanged });
    const stop = driver.observe?.(r.dev, r.link, () => undefined);
    await advance(10);
    r.tv.setPower('off');
    await advance(60000);
    expect(onHostChanged).not.toHaveBeenCalled();
    stop?.();
  });

  it('a changed certificate at the same host is notPaired after one search, never stored', async () => {
    const r = rig();
    const o = r.observe();
    await advance(10);
    r.tv.certSha256 = 'new-cert';
    r.tv.drop();
    await advance(25000);
    expect(r.lan.probes.length).toBe(1);
    await expect(r.key('up')).rejects.toMatchObject({ code: 'notPaired' });
    expect(r.onHostChanged).not.toHaveBeenCalled();
    expect(r.secrets.map.get(REF)).toBe(TOKEN);
    o.stop();
  });
});

describe('forget', () => {
  it('deletes the token, closes the socket, and is safe twice', async () => {
    const r = rig({ seed: { [REF]: TOKEN, 'samsung:other': 'keep' } });
    await r.key('up');
    expect(r.tv.connections()).toBe(1);
    await r.driver.forget?.(r.dev, r.link);
    expect(r.secrets.map.has(REF)).toBe(false);
    expect(r.tv.connections()).toBe(0);
    await r.driver.forget?.(r.dev, r.link);
    expect(r.secrets.map.get('samsung:other')).toBe('keep');
  });

  it('stops the poll and leaves another device alone', async () => {
    const r = rig({ seed: { [REF]: TOKEN, 'samsung:two': 'second' } });
    const o = r.observe();
    await advance(10);
    await r.driver.forget?.(r.dev, r.link);
    const n = r.tv.infoRequests();
    await advance(30000);
    expect(r.tv.infoRequests()).toBe(n);
    expect(r.secrets.map.get('samsung:two')).toBe('second');
    o.stop();
  });

  it('rethrows a failing delete after the entry is gone', async () => {
    const r = rig();
    await r.key('up');
    r.secrets.delete = () => Promise.reject(new Error('keystore'));
    await expect(r.driver.forget?.(r.dev, r.link)).rejects.toThrow('keystore');
    expect(r.tv.connections()).toBe(0);
  });
});
