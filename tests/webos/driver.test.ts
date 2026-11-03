import type { Command, Device, Link, Reported, TvKey } from '@/core';
import { createWebosDriver, type WebosDriverOpts } from '@/webos/driver';
import { rediscover } from '@/webos/rediscover';
import { KEY_BUTTON, URI } from '@/webos/ssap';
import { createFakeLan, type FakeLan } from '@/webos/testing/fakeLan';
import { createFakeTv, type FakeTv } from '@/webos/testing/fakeTv';
import type { TvSecretsWithDelete } from '@/tv/transport';
import { magicPacket } from '@/tv/wol';

const HOST = '192.168.1.23';
const MAC = 'aa:bb:cc:00:11:22';
const REF = 'webos:abc';

type WebosLink = Extract<Link, { kind: 'webos' }>;

function webos(over: Partial<WebosLink> = {}): WebosLink {
  return { kind: 'webos', host: HOST, mac: MAC, secure: false, clientKeyRef: REF, ...over };
}

function device(links: Link[]): Device {
  return { id: 'tv1', kind: 'tv', name: 'TV', roomId: 'r1', order: 0, links };
}

function secrets(seed: Record<string, string> = { [REF]: 'k', [`${REF}:usn`]: 'uuid:1234' }) {
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

const tvAt = (over: Partial<Parameters<typeof createFakeTv>[0]> = {}): FakeTv =>
  createFakeTv({ host: HOST, mac: MAC, usn: 'uuid:1234', knownKeys: ['k'], ...over });

async function advance(ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
}

interface Rig {
  tv: FakeTv;
  lan: FakeLan;
  driver: ReturnType<typeof createWebosDriver>;
  onHostChanged: jest.Mock;
  dev: Device;
  link: WebosLink;
  hang: string[];
  send(cmd: Command): Promise<void>;
  key(key: TvKey): Promise<void>;
  observe(): { reports: Reported[]; stop: () => void };
}

function rig(
  opts: {
    tvs?: FakeTv[];
    wifi?: boolean;
    secrets?: TvSecretsWithDelete;
    driver?: Partial<WebosDriverOpts>;
    links?: Link[];
  } = {},
): Rig {
  const tv = opts.tvs?.[0] ?? tvAt();
  const hang: string[] = [];
  const lan = createFakeLan({ tvs: opts.tvs ?? [tv], wifi: opts.wifi ?? true, hang });
  const onHostChanged = jest.fn().mockResolvedValue(undefined);
  const driver = createWebosDriver({
    transport: lan,
    secrets: opts.secrets ?? secrets(),
    onHostChanged,
    ...opts.driver,
  });
  const link = webos();
  const dev = device(opts.links ?? [link]);
  return {
    tv,
    lan,
    driver,
    onHostChanged,
    dev,
    link,
    hang,
    send: (cmd) => driver.send(dev, link, cmd),
    key: (key) => driver.send(dev, link, { kind: 'tv.key', key }),
    observe: () => {
      const reports: Reported[] = [];
      const stop = driver.observe?.(dev, link, (r) => reports.push(r)) ?? (() => undefined);
      return { reports, stop };
    },
  };
}

const mainSockets = (lan: FakeLan): string[] =>
  lan.opened.filter((u) => !u.includes('/resources/'));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('webos driver: basics', () => {
  it('is available', () => {
    const { driver } = rig();
    expect(driver.kind).toBe('webos');
    expect(driver.available()).toBe(true);
  });

  it('capabilities report inputList, text and powerOn from the MAC', () => {
    const { driver, dev, link } = rig();
    expect(driver.capabilities(dev, link)).toEqual({
      tv: { inputList: true, text: true, powerOn: true, voice: false },
    });
    const noMac = webos({ mac: undefined });
    expect(driver.capabilities(device([noMac]), noMac)).toEqual({
      tv: { inputList: true, text: true, powerOn: false, voice: false },
    });
    expect(driver.capabilities(device([noMac, { kind: 'ir', remoteId: 'a/b' }]), noMac)).toEqual({
      tv: { inputList: true, text: true, powerOn: true, voice: false },
    });
  });

  it('supports keys and text, and rejects the rest', async () => {
    const { driver, dev, link } = rig();
    expect(driver.supports(dev, link, { kind: 'tv.key', key: 'ok' })).toBe(true);
    expect(driver.supports(dev, link, { kind: 'tv.text', text: 'a' })).toBe(true);
    expect(driver.supports(dev, { kind: 'ir', remoteId: 'x' }, { kind: 'tv.key', key: 'ok' })).toBe(
      false,
    );
    expect(
      driver.supports(dev, link, {
        kind: 'fan.set',
        state: { power: true, speed: 1, boost: false, sleep: false, timerHours: 0 },
      }),
    ).toBe(false);
    await expect(
      driver.send(dev, link, {
        kind: 'fan.set',
        state: { power: true, speed: 1, boost: false, sleep: false, timerHours: 0 },
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
    await expect(
      driver.send(dev, { kind: 'ir', remoteId: 'x' }, { kind: 'tv.key', key: 'ok' }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('sends keys as pointer buttons', async () => {
    const r = rig();
    const keys = [
      'up',
      'down',
      'left',
      'right',
      'ok',
      'back',
      'home',
      'mute',
      'volumeUp',
      'volumeDown',
    ] as const;
    for (const k of keys) await r.key(k);
    expect(r.tv.buttons).toEqual(keys.map((k) => KEY_BUTTON[k]));
    expect(r.tv.requests.filter((q) => q.uri === URI.pointer)).toHaveLength(1);
  });

  it('power turns off over SSAP', async () => {
    const r = rig();
    await r.key('power');
    expect(r.tv.requests.map((q) => q.uri)).toContain(URI.turnOff);
    expect(r.tv.buttons).toEqual([]);
  });

  it('input launches the input picker', async () => {
    const r = rig();
    await r.key('input');
    expect(r.tv.requests).toContainEqual({
      uri: URI.launch,
      payload: { id: 'com.webos.app.inputpicker' },
    });
  });

  it('tv.input switches to that input', async () => {
    const r = rig();
    expect(r.driver.supports(r.dev, r.link, { kind: 'tv.input', inputId: 'HDMI_2' })).toBe(true);
    await r.send({ kind: 'tv.input', inputId: 'HDMI_2' });
    expect(r.tv.requests).toContainEqual({ uri: URI.switchInput, payload: { inputId: 'HDMI_2' } });
  });

  it('tv.input the TV refuses is notSent', async () => {
    const r = rig({ tvs: [tvAt({ failUris: [URI.switchInput] })] });
    await expect(r.send({ kind: 'tv.input', inputId: 'HDMI_9' })).rejects.toMatchObject({
      code: 'notSent',
    });
  });

  it('playPause alternates PAUSE, PLAY', async () => {
    const r = rig();
    await r.key('playPause');
    await r.key('playPause');
    await r.key('playPause');
    expect(r.tv.buttons).toEqual(['PAUSE', 'PLAY', 'PAUSE']);
  });

  it('text replaces the field', async () => {
    const r = rig();
    await r.send({ kind: 'tv.text', text: 'tom' });
    expect(r.tv.requests).toContainEqual({
      uri: URI.insertText,
      payload: { text: 'tom', replace: true },
    });
  });

  it('not paired: no key in secrets rejects notPaired and opens nothing', async () => {
    const r = rig({ secrets: secrets({}) });
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    expect(r.lan.opened).toEqual([]);
  });

  it('rejects notPaired when the TV asks to pair again, and never asks twice', async () => {
    const r = rig({ tvs: [tvAt({ knownKeys: [], prompt: 'never' })] });
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    const registers = (): number => r.tv.frames.filter((f) => f.type === 'register').length;
    expect(registers()).toBe(1);
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    expect(registers()).toBe(1);
    await advance(600000);
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    expect(registers()).toBe(1);
  });

  it('follows a host change saved in the store', async () => {
    const tv = tvAt();
    const r = rig({ tvs: [tv] });
    await r.key('ok');
    tv.moveTo('192.168.1.50');
    await advance(0);
    await r.driver.send(r.dev, webos({ host: '192.168.1.50' }), { kind: 'tv.key', key: 'up' });
    expect(tv.buttons).toEqual(['ENTER', 'UP']);
  });

  it('closes the connection idleCloseMs after the last press', async () => {
    const r = rig();
    await r.key('ok');
    expect(r.tv.connections()).toBe(2); // session and pointer
    await advance(9999);
    expect(r.tv.connections()).toBe(2);
    await advance(1);
    expect(r.tv.connections()).toBe(0);
    await r.key('ok');
    expect(mainSockets(r.lan)).toHaveLength(2);
    expect(r.tv.buttons).toEqual(['ENTER', 'ENTER']);
  });
});

describe('webos driver: power on', () => {
  it('powerOn sends WoL', async () => {
    const r = rig();
    await r.send({ kind: 'tv.powerOn' });
    expect(r.lan.wolPackets).toHaveLength(1);
    expect(r.lan.wolPackets[0]).toEqual(magicPacket(MAC));
    expect(r.lan.opened).toEqual([]);
  });

  it('supports powerOn only with a mac and no IR link', () => {
    const { driver } = rig();
    const cmd: Command = { kind: 'tv.powerOn' };
    const ir: Link = { kind: 'ir', remoteId: 'lg-tv/nec' };
    expect(driver.supports(device([webos()]), webos(), cmd)).toBe(true);
    expect(driver.supports(device([webos(), ir]), webos(), cmd)).toBe(false);
    const noMac = webos();
    delete noMac.mac;
    expect(driver.supports(device([noMac]), noMac, cmd)).toBe(false);
  });

  it('refuses to send powerOn without a mac, and maps WoL failures to notSent', async () => {
    const r = rig();
    const noMac = webos();
    delete noMac.mac;
    await expect(r.driver.send(r.dev, noMac, { kind: 'tv.powerOn' })).rejects.toMatchObject({
      code: 'unsupported',
    });
    jest.spyOn(r.lan, 'sendWol').mockRejectedValueOnce(new Error('ENETUNREACH'));
    await expect(r.send({ kind: 'tv.powerOn' })).rejects.toMatchObject({ code: 'notSent' });
  });
});

describe('webos driver: observe', () => {
  it('reports power, app title and volume', async () => {
    const r = rig();
    const { reports } = r.observe();
    await advance(0);
    r.tv.setApp('netflix');
    r.tv.setVolume(18);
    await advance(0);
    expect(reports[reports.length - 1]).toEqual({
      kind: 'tv',
      state: {
        power: true,
        app: 'Netflix',
        volume: 18,
        muted: false,
        inputs: expect.any(Array) as unknown,
      },
    });
  });

  it('reports the TV inputs, connected ones flagged', async () => {
    const r = rig();
    const { reports } = r.observe();
    await advance(0);
    expect(reports[reports.length - 1]).toMatchObject({
      state: {
        inputs: [
          { id: 'HDMI_1', label: 'HDMI 1', connected: true },
          { id: 'HDMI_2', label: 'PlayStation', connected: false },
        ],
      },
    });
  });

  it('reports no inputs when the TV refuses the list', async () => {
    const r = rig({ tvs: [tvAt({ failUris: [URI.inputs] })] });
    const { reports } = r.observe();
    await advance(0);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[reports.length - 1]?.state).not.toHaveProperty('inputs');
  });

  it('names system apps that have no launch point, and leaves out unknown ids', async () => {
    const r = rig();
    const { reports } = r.observe();
    await advance(0);
    r.tv.setApp('com.webos.app.livetv');
    await advance(0);
    expect(reports[reports.length - 1]).toMatchObject({ state: { app: 'Live TV' } });
    r.tv.setApp('com.webos.app.hdmi2');
    await advance(0);
    expect(reports[reports.length - 1]).toMatchObject({ state: { app: 'HDMI 2' } });
    r.tv.setApp('com.example.unknown');
    await advance(0);
    expect(reports[reports.length - 1]?.state).not.toHaveProperty('app');
  });

  it('reports only after the power state is known, and not twice for the same state', async () => {
    const r = rig();
    const { reports } = r.observe();
    await advance(0);
    const first = reports.length;
    expect(first).toBeGreaterThan(0);
    expect(reports[0]).toMatchObject({ kind: 'tv', state: { power: true } });
    r.tv.setVolume(10);
    await advance(0);
    expect(reports).toHaveLength(first);
  });

  it('reports power false when the TV goes to standby, and true again', async () => {
    const r = rig();
    const { reports } = r.observe();
    await advance(0);
    r.tv.setPowerState('Active Standby');
    await advance(0);
    expect(reports[reports.length - 1]).toMatchObject({ state: { power: false } });
    r.tv.setPowerState('Active');
    await advance(0);
    expect(reports[reports.length - 1]).toMatchObject({ state: { power: true } });
  });

  it('gives a second observer the last state at once', async () => {
    const r = rig();
    r.observe();
    await advance(0);
    const second = r.observe();
    expect(second.reports).toHaveLength(1);
    expect(second.reports[0]).toMatchObject({ kind: 'tv', state: { power: true } });
  });

  it('does not replay an old state to the next look: the TV is asked afresh', async () => {
    const r = rig();
    const first = r.observe();
    await advance(0);
    expect(first.reports[0]).toMatchObject({ state: { power: true } });
    first.stop();
    // Put in standby while no one watched; the idle connection is still open.
    r.tv.setPowerState('Active Standby');
    const next = r.observe();
    expect(next.reports).toHaveLength(0);
    await advance(0);
    expect(next.reports[0]).toMatchObject({ kind: 'tv', state: { power: false } });
    expect(next.reports.some((x) => x.kind === 'tv' && x.state.power)).toBe(false);
  });

  it('starts observing on a connection a press opened', async () => {
    const r = rig();
    await r.key('ok');
    const { reports } = r.observe();
    await advance(0);
    expect(reports[0]).toMatchObject({ state: { power: true } });
    expect(mainSockets(r.lan)).toHaveLength(1);
  });

  it('heartbeat reconnects silently', async () => {
    const r = rig();
    const { reports } = r.observe();
    await advance(0);
    expect(mainSockets(r.lan)).toHaveLength(1);
    r.tv.stopAnswering();
    await advance(8000);
    expect(mainSockets(r.lan)).toHaveLength(2);
    expect(reports.some((x) => x.kind === 'tv' && !x.state.power)).toBe(false);
    r.tv.setVolume(33);
    await advance(0);
    expect(reports[reports.length - 1]).toMatchObject({ state: { volume: 33 } });
  });

  it('keeps beating while the TV answers', async () => {
    const r = rig();
    r.observe();
    await advance(0);
    await advance(16000);
    expect(r.tv.requests.filter((q) => q.uri === URI.power).length).toBeGreaterThanOrEqual(4);
    expect(mainSockets(r.lan)).toHaveLength(1);
  });

  it('reconnects after a drop', async () => {
    const r = rig();
    const { reports } = r.observe();
    await advance(0);
    r.tv.drop();
    await advance(249);
    expect(mainSockets(r.lan)).toHaveLength(1);
    await advance(1);
    expect(mainSockets(r.lan)).toHaveLength(2);
    r.tv.setVolume(44);
    await advance(0);
    expect(reports[reports.length - 1]).toMatchObject({ state: { volume: 44 } });
  });

  it('closes the connection idleCloseMs after the last observer leaves', async () => {
    const r = rig();
    const { stop } = r.observe();
    await advance(0);
    stop();
    expect(r.tv.connections()).toBe(1);
    await advance(9999);
    expect(r.tv.connections()).toBe(1);
    await advance(1);
    expect(r.tv.connections()).toBe(0);
    await advance(30000);
    expect(mainSockets(r.lan)).toHaveLength(1);
  });

  it('does not reconnect once the observer has left', async () => {
    const r = rig();
    const { stop } = r.observe();
    await advance(0);
    stop();
    r.tv.drop();
    await advance(10000);
    expect(mainSockets(r.lan)).toHaveLength(1);
  });

  it('does not retry while the TV is unpaired', async () => {
    const r = rig({ secrets: secrets({}) });
    const { reports } = r.observe();
    await advance(30000);
    expect(r.lan.opened).toEqual([]);
    expect(reports).toEqual([]);
  });
});

describe('webos driver: review focus', () => {
  it('1. notSent within the connect budget, nothing written', async () => {
    const r = rig();
    r.hang.push(HOST);
    let err: unknown;
    r.key('volumeUp').catch((e: unknown) => (err = e));
    await advance(1499);
    expect(err).toBeUndefined();
    await advance(1);
    expect(err).toMatchObject({ code: 'notSent' });
    expect(r.tv.buttons).toEqual([]);
    expect(r.tv.frames).toEqual([]);
  });

  it('1. a press that joins a slow connect is not written after its budget', async () => {
    const r = rig();
    r.hang.push(HOST);
    const observe = r.observe();
    await advance(0);
    await advance(500);
    let err: unknown;
    r.key('volumeUp').catch((e: unknown) => (err = e));
    await advance(1500);
    expect(err).toMatchObject({ code: 'notSent' });
    r.hang.length = 0;
    await advance(10000);
    expect(r.tv.buttons).toEqual([]);
    observe.stop();
  });

  it('5. no late presses: a press while reconnecting is rejected and never sent later', async () => {
    const r = rig();
    const { stop } = r.observe();
    await advance(0);
    r.tv.setPower(false);
    await advance(100);
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notSent' });
    r.tv.setPower(true);
    await advance(20000);
    expect(r.tv.buttons).not.toContain('ENTER');
    expect(r.tv.buttons).toEqual([]);
    stop();
  });

  it('2. rediscovers by MAC and saves the new host once', async () => {
    const r = rig();
    const { stop } = r.observe();
    await advance(0);
    r.tv.moveTo('192.168.1.40');
    await advance(250);
    await advance(0);
    expect(r.onHostChanged).toHaveBeenCalledTimes(1);
    expect(r.onHostChanged).toHaveBeenCalledWith('tv1', '192.168.1.40');
    await advance(5000);
    // the caller still passes the old link (the store has not caught up): the press goes to the new host
    await r.key('ok');
    expect(r.tv.buttons).toEqual(['ENTER']);
    expect(r.onHostChanged).toHaveBeenCalledTimes(1);
    stop();
  });

  it('2. never adopts another TV at the old address', async () => {
    const other = createFakeTv({ host: HOST, mac: '00:11:22:33:44:55', prompt: 'never' });
    const r = rig({ tvs: [other] });
    const { reports, stop } = r.observe();
    await advance(20000);
    expect(r.onHostChanged).not.toHaveBeenCalled();
    expect(other.buttons).toEqual([]);
    expect(other.frames.filter((f) => f.type === 'register').length).toBeLessThanOrEqual(2);
    // Something at that address wants pairing: that is not "the TV is off".
    expect(reports).not.toContainEqual({ kind: 'tv', state: { power: false } });
    stop();
  });

  it('4. TV off: after 3000 ms the observer gets power false', async () => {
    const r = rig({ tvs: [] });
    const { reports, stop } = r.observe();
    await advance(2999);
    expect(reports).toEqual([]);
    await advance(1);
    expect(reports).toEqual([{ kind: 'tv', state: { power: false } }]);
    stop();
  });

  it('4. TV off, then on: reports the real state again', async () => {
    const tv = tvAt();
    tv.setPower(false);
    const r = rig({ tvs: [tv] });
    const { reports, stop } = r.observe();
    await advance(3000);
    expect(reports).toEqual([{ kind: 'tv', state: { power: false } }]);
    tv.setPower(true);
    await advance(10000);
    expect(reports[reports.length - 1]).toMatchObject({ state: { power: true, volume: 10 } });
    stop();
  });

  it('4. off network: no power false report', async () => {
    const r = rig({ wifi: false });
    const { reports, stop } = r.observe();
    await advance(20000);
    expect(reports).toEqual([]);
    expect(r.lan.opened.length).toBeGreaterThan(0);
    stop();
  });

  it('4. back on Wi-Fi: connects without a report in between', async () => {
    const r = rig({ wifi: false });
    const { reports, stop } = r.observe();
    await advance(10000);
    r.lan.wifi = true;
    await advance(10000);
    expect(reports[0]).toMatchObject({ state: { power: true } });
    stop();
  });
});

describe('rediscover', () => {
  const link = webos();
  const tvMoved = (over: Partial<Parameters<typeof createFakeTv>[0]> = {}): FakeTv =>
    createFakeTv({ host: '192.168.1.40', mac: MAC, usn: 'uuid:1234', knownKeys: ['k'], ...over });

  it('finds the TV at its new address', async () => {
    const lan = createFakeLan({ tvs: [tvMoved()] });
    const p = rediscover(lan, secrets(), link);
    await advance(3000);
    await expect(p).resolves.toBe('192.168.1.40');
  });

  it('is null without a mac or a key', async () => {
    const lan = createFakeLan({ tvs: [tvMoved()] });
    const noMac = webos();
    delete noMac.mac;
    await expect(rediscover(lan, secrets(), noMac)).resolves.toBeNull();
    await expect(rediscover(lan, secrets({}), link)).resolves.toBeNull();
  });

  it('rejects a TV that accepts the key but has another MAC', async () => {
    const lan = createFakeLan({ tvs: [tvMoved({ mac: '00:11:22:33:44:55' })] });
    const p = rediscover(lan, secrets(), link);
    await advance(3000);
    await expect(p).resolves.toBeNull();
  });

  it('skips a TV that prompts, and prefers the stored USN', async () => {
    const stranger = createFakeTv({
      host: '192.168.1.41',
      mac: '00:11:22:33:44:55',
      usn: 'uuid:other',
      prompt: 'never',
    });
    const real = tvMoved();
    const lan = createFakeLan({ tvs: [stranger, real] });
    const p = rediscover(lan, secrets(), link, { maxCandidates: 1 });
    await advance(3000);
    await expect(p).resolves.toBe('192.168.1.40');
    expect(stranger.frames).toEqual([]);
  });

  it('gives up after maxCandidates', async () => {
    const strangers = [41, 42, 43].map((n) =>
      createFakeTv({ host: `192.168.1.${n}`, mac: `00:00:00:00:00:0${n - 40}`, prompt: 'never' }),
    );
    const real = tvMoved({ host: '192.168.1.44', usn: 'uuid:changed' });
    const lan = createFakeLan({ tvs: [...strangers, real] });
    const p = rediscover(lan, secrets(), link, { maxCandidates: 3 });
    await advance(3000);
    await expect(p).resolves.toBeNull();
    expect(real.frames).toEqual([]);
  });

  it('gives up when discovery hangs', async () => {
    const lan = createFakeLan({ tvs: [] });
    jest.spyOn(lan, 'ssdpSearch').mockReturnValue(new Promise(() => undefined));
    jest.spyOn(lan, 'probe').mockReturnValue(new Promise(() => undefined));
    const p = rediscover(lan, secrets(), link);
    await advance(20000);
    await expect(p).resolves.toBeNull();
  });
});

describe('webos driver: fix round 1', () => {
  it.each([['power' as const], ['input' as const]])(
    'tv.key %s written then dropped before the reply is a timeout, never notSent',
    async (key) => {
      const uri = key === 'power' ? URI.turnOff : URI.launch;
      const r = rig({ tvs: [tvAt({ dropOn: uri })] });
      await expect(r.key(key)).rejects.toMatchObject({ code: 'timeout' });
      expect(r.tv.requests.map((q) => q.uri)).toContain(uri);
    },
  );

  it('a TV error reply to a press is notSent (it refused)', async () => {
    const r = rig({ tvs: [tvAt({ failUris: [URI.turnOff] })] });
    await expect(r.key('power')).rejects.toMatchObject({ code: 'notSent' });
  });

  it('heartbeat: an error reply to getPowerState proves the link is alive', async () => {
    const r = rig({ tvs: [tvAt({ failUris: [URI.power] })] });
    const { reports, stop } = r.observe();
    await advance(30000);
    expect(mainSockets(r.lan)).toHaveLength(1);
    expect(reports[0]).toMatchObject({ state: { power: true } });
    stop();
  });

  it('a revoked key over 300 s produces exactly one register and is not reported as off', async () => {
    const tv = tvAt({ knownKeys: [], prompt: 'never' });
    const r = rig({ tvs: [tv] });
    const { reports, stop } = r.observe();
    await advance(300000);
    expect(tv.frames.filter((f) => f.type === 'register')).toHaveLength(1);
    expect(reports).not.toContainEqual({ kind: 'tv', state: { power: false } });
    stop();
  });

  it('after the prompt a send throws notPaired at once and opens no socket', async () => {
    const tv = tvAt({ knownKeys: [], prompt: 'never' });
    const r = rig({ tvs: [tv] });
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    const opened = r.lan.opened.length;
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    await advance(120000);
    await expect(r.send({ kind: 'tv.text', text: 'a' })).rejects.toMatchObject({
      code: 'notPaired',
    });
    expect(r.lan.opened).toHaveLength(opened);
  });

  it('a prompt seen by rediscovery is another TV: our link is not notPaired', async () => {
    const other = createFakeTv({ host: '192.168.1.41', mac: '00:11:22:33:44:55', prompt: 'never' });
    const r = rig({ tvs: [other] });
    const { stop } = r.observe();
    await advance(10000);
    await expect(r.key('ok')).rejects.not.toMatchObject({ code: 'notPaired' });
    await advance(300000);
    expect(other.frames.filter((f) => f.type === 'register').length).toBeLessThanOrEqual(6);
    stop();
  });

  it('rediscovery goes past a prompting TV and uses the real one found later', async () => {
    const other = createFakeTv({ host: '192.168.1.41', mac: '00:11:22:33:44:55', prompt: 'never' });
    const real = tvAt({ host: '192.168.1.40', usn: 'uuid:other' });
    const r = rig({ tvs: [other, real] });
    const { stop } = r.observe();
    await advance(10000);
    expect(r.onHostChanged).toHaveBeenCalledWith('tv1', '192.168.1.40');
    await r.key('ok');
    expect(real.buttons).toEqual(['ENTER']);
    expect(other.frames.filter((f) => f.type === 'register')).toHaveLength(1);
    stop();
  });

  it('clearNotPaired lets the driver connect again', async () => {
    const tv = tvAt({ knownKeys: [], prompt: 'never' });
    const r = rig({ tvs: [tv] });
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    tv.knownKeys.push('k');
    r.driver.clearNotPaired('tv1');
    await r.key('ok');
    expect(tv.buttons).toEqual(['ENTER']);
  });

  it('clearNotPaired takes the stored link: reconnects to the new host, keeps other TVs held off', async () => {
    const oldTv = tvAt({ knownKeys: [], prompt: 'never' });
    const newTv = tvAt({ host: '192.168.1.50' });
    const otherTv = createFakeTv({
      host: '192.168.1.60',
      mac: '00:11:22:33:44:55',
      prompt: 'never',
    });
    const r = rig({ tvs: [oldTv, newTv, otherTv] });
    const otherLink = webos({ host: '192.168.1.60', mac: '00:11:22:33:44:55' });
    const other = { ...r.dev, id: 'tv2', links: [otherLink] };
    const otherStop = r.driver.observe?.(other, otherLink, () => undefined);
    const { reports, stop } = r.observe();
    await advance(1000);
    expect(otherTv.frames.filter((f) => f.type === 'register')).toHaveLength(1);
    r.driver.clearNotPaired('tv1', webos({ host: '192.168.1.50' }));
    await advance(1000);
    expect(reports).toContainEqual({ kind: 'tv', state: { power: true } });
    expect(newTv.frames.filter((f) => f.type === 'register')).toHaveLength(1);
    // The other TV's hold-off survives: no second prompt on its screen.
    r.driver.clearNotPaired('tv1');
    await advance(30000);
    expect(otherTv.frames.filter((f) => f.type === 'register')).toHaveLength(1);
    stop();
    otherStop?.();
  });

  it('a successful register on the own host leaves the link usable (notPaired cleared)', async () => {
    const tv = tvAt({ knownKeys: [], prompt: 'never' });
    const r = rig({ tvs: [tv] });
    await expect(r.key('ok')).rejects.toMatchObject({ code: 'notPaired' });
    tv.knownKeys.push('k');
    r.driver.clearNotPaired('tv1');
    await r.key('ok');
    await r.key('up');
    expect(tv.buttons).toEqual(['ENTER', 'UP']);
  });

  it('a revoked key: at most one register a minute, and not reported as off', async () => {
    const tv = tvAt({ knownKeys: [], prompt: 'never' });
    const r = rig({ tvs: [tv] });
    const { reports, stop } = r.observe();
    await advance(120000);
    const registers = tv.frames.filter((f) => f.type === 'register').length;
    expect(registers).toBeGreaterThanOrEqual(1);
    expect(registers).toBeLessThanOrEqual(3);
    expect(reports).not.toContainEqual({ kind: 'tv', state: { power: false } });
    stop();
  });

  it('a TV that stays off is searched for at most every 30 s, one probe at a time', async () => {
    const r = rig({ tvs: [] });
    const real = r.lan.probe.bind(r.lan);
    const probe = jest.spyOn(r.lan, 'probe');
    let inFlight = 0;
    let max = 0;
    probe.mockImplementation((...a) => {
      inFlight++;
      max = Math.max(max, inFlight);
      return real(...a).finally(() => inFlight--);
    });
    const dev2 = { ...r.dev, id: 'tv2' };
    const a = r.driver.observe?.(r.dev, r.link, () => undefined);
    const b = r.driver.observe?.(dev2, r.link, () => undefined);
    await advance(90000);
    expect(max).toBe(1);
    expect(probe.mock.calls.length).toBeLessThanOrEqual(6);
    a?.();
    b?.();
  });

  it('without a MAC it says off only after the usual wait', async () => {
    const link = webos();
    delete link.mac;
    const r = rig({ tvs: [], links: [link] });
    const reports: Reported[] = [];
    const stop = r.driver.observe?.(r.dev, link, (x) => reports.push(x));
    await advance(2999);
    expect(reports).toEqual([]);
    await advance(1);
    expect(reports).toEqual([{ kind: 'tv', state: { power: false } }]);
    stop?.();
  });

  it('saves a host found by rediscovery even if the last observer just left', async () => {
    const r = rig();
    const { stop } = r.observe();
    await advance(0);
    const orig = r.lan.ssdpSearch.bind(r.lan);
    jest.spyOn(r.lan, 'ssdpSearch').mockImplementation((...a) => {
      stop();
      return orig(...a);
    });
    r.tv.moveTo('192.168.1.40');
    await advance(5000);
    expect(r.onHostChanged).toHaveBeenCalledWith('tv1', '192.168.1.40');
  });
});

describe('rediscover: hold-off and ports', () => {
  it('skips held-off hosts without registering, and reports prompts', async () => {
    const stranger = createFakeTv({
      host: '192.168.1.41',
      mac: '00:11:22:33:44:55',
      prompt: 'never',
    });
    const real = createFakeTv({
      host: '192.168.1.40',
      mac: MAC,
      usn: 'uuid:changed',
      knownKeys: ['k'],
    });
    const lan = createFakeLan({ tvs: [stranger, real] });
    const prompted: string[] = [];
    const p = rediscover(lan, secrets(), webos(), {
      maxCandidates: 1,
      isHeldOff: (h) => h === '192.168.1.41',
      onPrompted: (h) => prompted.push(h),
    });
    await advance(3000);
    await expect(p).resolves.toBe('192.168.1.40');
    expect(stranger.frames).toEqual([]);

    const lan2 = createFakeLan({ tvs: [stranger] });
    const p2 = rediscover(lan2, secrets(), webos(), { onPrompted: (h) => prompted.push(h) });
    await advance(3000);
    await expect(p2).resolves.toBeNull();
    expect(prompted).toEqual(['192.168.1.41']);
  });

  it('checks candidates on the port the driver will use (link.secure)', async () => {
    const tv = createFakeTv({ host: '192.168.1.40', mac: MAC, secure: true, knownKeys: ['k'] });
    const lan = createFakeLan({ tvs: [tv] });
    const s = secrets({ [REF]: 'k', [`${REF}:cert`]: tv.certSha256 });
    const p = rediscover(lan, s, webos({ secure: true }));
    await advance(3000);
    await expect(p).resolves.toBe('192.168.1.40');
    expect(lan.opened.every((u) => u.startsWith('wss://'))).toBe(true);
  });

  it('passes the stored pin to every secure candidate, and accepts only a matching certificate', async () => {
    const other = createFakeTv({ host: '192.168.1.41', mac: MAC, secure: true, knownKeys: ['k'] });
    other.certSha256 = 'someone-else';
    const tv = createFakeTv({ host: '192.168.1.40', mac: MAC, secure: true, knownKeys: ['k'] });
    const lan = createFakeLan({ tvs: [other, tv] });
    const s = secrets({ [REF]: 'k', [`${REF}:cert`]: tv.certSha256 });
    const p = rediscover(lan, s, webos({ secure: true }));
    await advance(3000);
    await expect(p).resolves.toBe('192.168.1.40');
    const mainTls = lan.tlsOpened.filter((_, i) => !lan.opened[i]?.includes('/resources/'));
    expect(mainTls.length).toBeGreaterThan(0);
    expect(mainTls.every((t) => t?.pinSha256 === tv.certSha256 && !t.pairing)).toBe(true);
  });

  it('never searches a secure link that has no stored pin', async () => {
    const tv = createFakeTv({ host: '192.168.1.40', mac: MAC, secure: true, knownKeys: ['k'] });
    const lan = createFakeLan({ tvs: [tv] });
    const p = rediscover(lan, secrets({ [REF]: 'k' }), webos({ secure: true }));
    await advance(3000);
    await expect(p).resolves.toBeNull();
    expect(lan.opened).toEqual([]);
  });
});

describe('webos driver: secure (wss) links', () => {
  const secureRig = (pin: string | undefined, over: { certSha256?: string } = {}) => {
    const tv = tvAt({ secure: true, ...over });
    const seed: Record<string, string> = { [REF]: 'k', [`${REF}:usn`]: 'uuid:1234' };
    if (pin !== undefined) seed[`${REF}:cert`] = pin;
    const s = secrets(seed);
    const r = rig({ tvs: [tv], secrets: s, links: [webos({ secure: true })] });
    const link = webos({ secure: true });
    return {
      ...r,
      link,
      s,
      key: (key: TvKey) => r.driver.send(r.dev, link, { kind: 'tv.key', key }),
    };
  };

  it('reconnects with the stored pin, on the main socket and the pointer socket', async () => {
    const r = secureRig(`cert-${MAC.replace(/:/g, '')}`);
    await r.key('volumeUp');
    expect(r.tv.buttons).toEqual([KEY_BUTTON.volumeUp]);
    expect(r.lan.opened[0]).toBe(`wss://${HOST}:3001`);
    expect(r.lan.tlsOpened.length).toBeGreaterThanOrEqual(2);
    for (const tls of r.lan.tlsOpened) {
      expect(tls).toEqual({ pinSha256: r.tv.certSha256 });
    }
  });

  it('rejects notPaired when the certificate is not the pinned one', async () => {
    const r = secureRig('the-pin-from-pairing');
    await expect(r.key('volumeUp')).rejects.toMatchObject({
      code: 'notPaired',
      message: expect.stringContaining('certificate'),
    });
    expect(r.tv.buttons).toEqual([]);
    expect(r.tv.frames).toEqual([]);
  });

  it('a pin mismatch searches once, then stops the observe loop without reporting the TV as off', async () => {
    const r = secureRig('the-pin-from-pairing');
    const reports: Reported[] = [];
    const stop = r.driver.observe?.(r.dev, r.link, (rep) => reports.push(rep));
    await advance(10000);
    const opens = r.lan.opened.length;
    await advance(60000);
    expect(reports).toEqual([]);
    expect(r.lan.opened).toHaveLength(opens);
    expect(r.lan.opened.every((u) => u === `wss://${HOST}:3001`)).toBe(true);
    // Latched like a prompt: the next press does not even try.
    await expect(r.key('volumeUp')).rejects.toMatchObject({ code: 'notPaired' });
    expect(r.lan.opened).toHaveLength(opens);
    stop?.();
  });

  it('finds the TV at its new address when another secure TV took the old one', async () => {
    const pin = `cert-${MAC.replace(/:/g, '')}`;
    const ours = tvAt({ secure: true, host: '192.168.1.40' });
    const other = createFakeTv({
      host: HOST,
      mac: 'aa:bb:cc:99:88:77',
      usn: 'uuid:other',
      secure: true,
      knownKeys: ['k'],
    });
    const s = secrets({ [REF]: 'k', [`${REF}:usn`]: 'uuid:1234', [`${REF}:cert`]: pin });
    const r = rig({ tvs: [ours, other], secrets: s, links: [webos({ secure: true })] });
    const link = webos({ secure: true });
    const stop = r.driver.observe?.(r.dev, link, () => undefined);
    await advance(10000);
    expect(r.onHostChanged).toHaveBeenCalledWith(r.dev.id, '192.168.1.40');
    await r.driver.send(r.dev, link, { kind: 'tv.key', key: 'volumeUp' });
    expect(ours.buttons).toEqual([KEY_BUTTON.volumeUp]);
    expect(other.buttons).toEqual([]);
    stop?.();
  });

  it('connects again once re-paired after a mismatch', async () => {
    const r = secureRig('the-pin-from-pairing');
    await expect(r.key('volumeUp')).rejects.toMatchObject({ code: 'notPaired' });
    await r.s.set(`${REF}:cert`, r.tv.certSha256);
    r.driver.clearNotPaired(r.dev.id, r.link);
    await r.key('volumeUp');
    expect(r.tv.buttons).toEqual([KEY_BUTTON.volumeUp]);
  });

  it('treats a secure link with no stored pin as not paired and never opens it', async () => {
    const r = secureRig(undefined);
    await expect(r.key('volumeUp')).rejects.toMatchObject({ code: 'notPaired' });
    expect(r.lan.opened).toEqual([]);
    const reports: Reported[] = [];
    const stop = r.driver.observe?.(r.dev, r.link, (rep) => reports.push(rep));
    await advance(10000);
    expect(r.lan.opened).toEqual([]);
    expect(reports).toEqual([]);
    stop?.();
  });
});

describe('webos driver: abort signal and forget', () => {
  it('rejects notSent and writes nothing when already aborted', async () => {
    const r = rig();
    const ac = new AbortController();
    ac.abort();
    await expect(
      r.driver.send(r.dev, r.link, { kind: 'tv.key', key: 'volumeUp' }, ac.signal),
    ).rejects.toMatchObject({ code: 'notSent' });
    await expect(
      r.driver.send(r.dev, r.link, { kind: 'tv.powerOn' }, ac.signal),
    ).rejects.toMatchObject({ code: 'notSent' });
    await advance(100);
    expect(r.lan.opened).toEqual([]);
    expect(r.tv.frames).toEqual([]);
  });

  it('does not write when aborted while connecting', async () => {
    const r = rig();
    const ac = new AbortController();
    const p = r.driver.send(r.dev, r.link, { kind: 'tv.key', key: 'volumeUp' }, ac.signal);
    const result = p.catch((e: unknown) => e);
    ac.abort();
    await advance(100);
    expect(await result).toMatchObject({ code: 'notSent' });
    expect(r.tv.buttons).toEqual([]);
  });

  it('sends normally with a live signal, and a later abort changes nothing', async () => {
    const r = rig();
    const ac = new AbortController();
    await r.driver.send(r.dev, r.link, { kind: 'tv.key', key: 'volumeUp' }, ac.signal);
    ac.abort();
    await advance(100);
    expect(r.tv.buttons).toEqual([KEY_BUTTON.volumeUp]);
  });

  it('forget deletes the client key, the USN and the certificate pin, and is idempotent', async () => {
    const s = secrets({
      [REF]: 'k',
      [`${REF}:usn`]: 'uuid:1234',
      [`${REF}:cert`]: 'abc',
      'webos:other': 'x',
    });
    const r = rig({ secrets: s });
    await r.driver.forget?.(r.dev, r.link);
    expect([...s.map.keys()]).toEqual(['webos:other']);
    await expect(r.driver.forget?.(r.dev, r.link)).resolves.toBeUndefined();
    expect([...s.map.keys()]).toEqual(['webos:other']);
  });

  it('forget tolerates a key that foundation already deleted', async () => {
    const s = secrets({ [`${REF}:usn`]: 'uuid:1234' });
    const r = rig({ secrets: s });
    await expect(r.driver.forget?.(r.dev, r.link)).resolves.toBeUndefined();
    expect(s.map.size).toBe(0);
  });

  it('forget still deletes the USN when the key delete fails, then reports the failure', async () => {
    const s = secrets();
    const del = s.delete.bind(s);
    s.delete = (ref) => (ref === REF ? Promise.reject(new Error('boom')) : del(ref));
    const r = rig({ secrets: s });
    await expect(r.driver.forget?.(r.dev, r.link)).rejects.toThrow('boom');
    expect(s.map.has(`${REF}:usn`)).toBe(false);
  });

  it('forget closes the connection and ignores non-webos links', async () => {
    const s = secrets();
    const r = rig({ secrets: s });
    await r.key('volumeUp');
    await r.driver.forget?.(r.dev, { kind: 'ir', remoteId: 'x' });
    expect(s.map.size).toBe(2);
    const before = r.lan.opened.length;
    await r.driver.forget?.(r.dev, r.link);
    await advance(30000);
    expect(r.lan.opened).toHaveLength(before);
  });
});
