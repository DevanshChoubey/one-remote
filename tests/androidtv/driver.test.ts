import { createAndroidTvDriver } from '@/androidtv/driver';
import { KEYCODE } from '@/androidtv/keys';
import { createFakeAtv, type FakeAtv } from '@/androidtv/testing/fakeAtv';
import { createFakeAtvLan } from '@/androidtv/testing/fakeAtvLan';
import { DeviceError, type Device, type Reported, type TvKey, type TvLink } from '@/core';
import { magicPacket } from '@/tv/wol';

const HOST = '192.168.1.20';
type AtvLink = Extract<TvLink, { kind: 'androidtv' }>;

const linkFor = (tv: FakeAtv, extra: Partial<AtvLink> = {}): AtvLink => ({
  kind: 'androidtv',
  host: tv.host,
  certRef: 'androidtv:identity',
  pinSha256: tv.certSha256,
  ...extra,
});
const deviceOf = (id: string, link: AtvLink, more: Device['links'] = []): Device => ({
  id,
  kind: 'tv',
  name: id,
  roomId: 'r',
  order: 0,
  links: [link, ...more],
});

/** Lets pending promises and timers run for `ms` of fake time. */
async function tick(ms: number, step = 50): Promise<void> {
  for (let left = ms; ; left -= step) {
    for (let j = 0; j < 25; j++) await Promise.resolve();
    if (left <= 0) return;
    jest.advanceTimersByTime(Math.min(step, left));
  }
}

async function setup(o: { devices?: () => Promise<Device[]>; link?: Partial<AtvLink> } = {}) {
  const tv = createFakeAtv({ host: HOST });
  const tvs = [tv];
  const lan = createFakeAtvLan({ tvs });
  const id = await lan.ensureIdentity('androidtv:identity', 'One Remote');
  tv.trusted.add(id.modulusHex);
  const hostChanged = jest.fn(async (_id: string, _host: string) => undefined);
  const driver = createAndroidTvDriver({
    transport: lan,
    devices: o.devices ?? (async () => []),
    onHostChanged: hostChanged,
  });
  const link = linkFor(tv, o.link);
  const device = deviceOf('tv1', link);
  return { tv, tvs, lan, driver, hostChanged, link, device, id };
}

function watch(driver: ReturnType<typeof createAndroidTvDriver>, device: Device, link: AtvLink) {
  const reports: Reported[] = [];
  const stop = driver.observe!(device, link, (r) => reports.push(r));
  return { reports, stop };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('keys', () => {
  it('sends the Android code of every key', async () => {
    const { tv, driver, device, link } = await setup();
    const keys: TvKey[] = [
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
      'playPause',
      'input',
      'power',
    ];
    for (const key of keys) await driver.send(device, link, { kind: 'tv.key', key });
    expect(tv.keys.map((k) => k.code)).toEqual(keys.map((k) => KEYCODE[k]));
    expect(tv.keys.every((k) => k.direction === 3)).toBe(true);
    expect(KEYCODE.input).toBe(178);
    expect(KEYCODE.playPause).toBe(85);
    expect(KEYCODE.power).toBe(26);
    expect(KEYCODE.mute).toBe(164);
  });

  it('does not support the input list, other links, or other commands', async () => {
    const { driver, device, link } = await setup();
    expect(driver.supports(device, link, { kind: 'tv.input', inputId: 'HDMI_1' })).toBe(false);
    expect(driver.supports(device, link, { kind: 'tv.key', key: 'up' })).toBe(true);
    expect(driver.supports(device, link, { kind: 'tv.text', text: 'a' })).toBe(true);
    expect(
      driver.supports(
        device,
        { kind: 'webos', host: HOST, secure: false, clientKeyRef: 'x' },
        { kind: 'tv.key', key: 'up' },
      ),
    ).toBe(false);
    await expect(
      driver.send(device, link, { kind: 'tv.input', inputId: 'x' }),
    ).rejects.toMatchObject({
      code: 'unsupported',
    });
  });
});

describe('capabilities', () => {
  it('has no power-on without a MAC, IR or a standby that answers', async () => {
    const { driver, device, link } = await setup();
    expect(driver.capabilities(device, link)).toEqual({
      tv: { inputList: false, text: true, powerOn: false },
    });
    expect(driver.supports(device, link, { kind: 'tv.powerOn' })).toBe(false);
  });

  it('has power-on with a MAC, and with an ir link (but then it is not ours to send)', async () => {
    const { tv, driver } = await setup();
    const withMac = linkFor(tv, { mac: 'aa:bb:cc:dd:ee:ff' });
    expect(driver.capabilities(deviceOf('tv1', withMac), withMac).tv?.powerOn).toBe(true);
    expect(driver.supports(deviceOf('tv1', withMac), withMac, { kind: 'tv.powerOn' })).toBe(true);
    const ir = deviceOf('tv1', linkFor(tv), [{ kind: 'ir', remoteId: 'x' }]);
    expect(driver.capabilities(ir, ir.links[0]!).tv?.powerOn).toBe(true);
    expect(driver.supports(ir, ir.links[0]!, { kind: 'tv.powerOn' })).toBe(false);
  });

  it('has power-on once a live session reported started: false', async () => {
    const { tv, driver, device, link } = await setup();
    tv.standby({ answers: true });
    watch(driver, device, link);
    await tick(100);
    expect(driver.capabilities(device, link).tv?.powerOn).toBe(true);
    expect(driver.supports(device, link, { kind: 'tv.powerOn' })).toBe(true);
  });
});

describe('text', () => {
  it('types into an open field', async () => {
    const { tv, driver, device, link } = await setup();
    await driver.send(device, link, { kind: 'tv.key', key: 'ok' });
    tv.openTextField(2, 5);
    await tick(10);
    await driver.send(device, link, { kind: 'tv.text', text: 'news' });
    expect(tv.imeEdits).toEqual([{ imeCounter: 2, fieldCounter: 5, value: 'news' }]);
  });

  it('fails at once with no field open', async () => {
    const { driver, device, link } = await setup();
    const started = Date.now();
    await expect(
      driver.send(device, link, { kind: 'tv.text', text: 'news' }),
    ).rejects.toMatchObject({
      code: 'notSent',
      message: 'No text field is open on the TV',
    });
    expect(Date.now() - started).toBeLessThan(2);
  });
});

describe('power on', () => {
  it('presses the power key once when the TV is in standby and answers', async () => {
    const { tv, driver, device, link } = await setup();
    tv.standby({ answers: true });
    await driver.send(device, link, { kind: 'tv.powerOn' });
    expect(tv.keys).toEqual([{ code: 26, direction: 3 }]);
  });

  it('sends nothing when the TV is already on (power is a toggle)', async () => {
    const { tv, lan, driver, device, link } = await setup();
    await driver.send(device, link, { kind: 'tv.powerOn' });
    expect(tv.keys).toEqual([]);
    expect(lan.wolPackets).toEqual([]);
  });

  it('uses Wake on LAN when the TV does not answer and there is a MAC', async () => {
    const { tv, lan, driver, device } = await setup();
    const link = linkFor(tv, { mac: 'aa:bb:cc:dd:ee:ff' });
    tv.standby({ answers: false });
    await driver.send(device, link, { kind: 'tv.powerOn' });
    expect(lan.wolPackets).toEqual([magicPacket('aa:bb:cc:dd:ee:ff')]);
    expect(tv.keys).toEqual([]);
  });

  it('fails notSent with no MAC when the TV does not answer', async () => {
    const { tv, lan, driver, device, link } = await setup();
    tv.standby({ answers: false });
    await expect(driver.send(device, link, { kind: 'tv.powerOn' })).rejects.toMatchObject({
      code: 'notSent',
    });
    expect(lan.wolPackets).toEqual([]);
  });
});

describe('observe', () => {
  it('reports power, volume and app, once per change', async () => {
    const { tv, driver, device, link } = await setup();
    const { reports } = watch(driver, device, link);
    await tick(10);
    expect(reports).toEqual([{ kind: 'tv', state: { power: true, volume: 20, muted: false } }]);
    tv.setVolume(23, 50, false);
    await tick(10);
    tv.setVolume(23, 50, false);
    await tick(10);
    tv.setApp('com.netflix.ninja');
    await tick(10);
    expect(reports.map((r) => (r.kind === 'tv' ? r.state : null))).toEqual([
      { power: true, volume: 20, muted: false },
      { power: true, volume: 46, muted: false },
      { power: true, volume: 46, muted: false, app: 'Netflix' },
    ]);
  });

  it('gives a second observer the last state at once', async () => {
    const { driver, device, link } = await setup();
    watch(driver, device, link);
    await tick(10);
    const second = watch(driver, device, link);
    expect(second.reports).toHaveLength(1);
  });

  it('reports the standby of a TV that answers as power off', async () => {
    const { tv, driver, device, link } = await setup();
    const { reports } = watch(driver, device, link);
    await tick(10);
    tv.setPower(false);
    await tick(10);
    expect(reports[reports.length - 1]).toEqual({
      kind: 'tv',
      state: { power: false, volume: 20, muted: false },
    });
  });
});

describe('reconnect', () => {
  it('connects again 250 ms after a drop, with no off report', async () => {
    const { tv, driver, device, link } = await setup();
    const { reports } = watch(driver, device, link);
    await tick(10);
    expect(tv.connections(6466)).toBe(1);
    tv.drop();
    await tick(240);
    expect(tv.connections(6466)).toBe(0);
    await tick(20);
    expect(tv.connections(6466)).toBe(1);
    expect(reports.every((r) => r.kind === 'tv' && r.state.power)).toBe(true);
  });

  it('closes a silent TV after 16000 ms and connects again', async () => {
    const { tv, driver, device, link } = await setup();
    watch(driver, device, link);
    await tick(10);
    tv.stopAnswering();
    await tick(15900, 100);
    expect(tv.connections(6466)).toBe(1);
    await tick(600);
    expect(tv.opened(6466)).toBe(2);
    expect(tv.connections(6466)).toBe(1);
  });
});

describe('off', () => {
  it('reports power off 3000 ms after the TV stops answering', async () => {
    const { tv, driver, device, link } = await setup();
    const { reports } = watch(driver, device, link);
    await tick(10);
    tv.standby({ answers: false });
    await tick(2900, 100);
    expect(reports).toHaveLength(1);
    // The 3000 ms count from the first failed connect, 250 ms after the drop.
    await tick(600, 100);
    expect(reports[reports.length - 1]).toEqual({ kind: 'tv', state: { power: false } });
  });

  it('says nothing while the phone is off Wi-Fi', async () => {
    const { tv, lan, driver, device, link } = await setup();
    const { reports } = watch(driver, device, link);
    await tick(10);
    lan.wifi = false;
    tv.drop();
    await tick(10000, 100);
    expect(reports).toHaveLength(1);
  });
});

describe('pin mismatch', () => {
  it('finds the TV at its new address and never talks to the one now at the old address', async () => {
    const { tv, tvs, lan, driver, device, link, hostChanged, id } = await setup();
    const { reports } = watch(driver, device, link);
    await tick(10);
    tv.moveTo('192.168.1.31');
    const other = createFakeAtv({ host: '192.168.1.99', certSha256: 'someone-else' });
    other.trusted.add(id.modulusHex);
    other.moveTo(HOST);
    tvs.push(other);
    await tick(3000, 100);
    expect(hostChanged).toHaveBeenCalledTimes(1);
    expect(hostChanged).toHaveBeenCalledWith('tv1', '192.168.1.31');
    expect(tv.connections(6466)).toBe(1);
    expect(other.opened(6466)).toBe(0);
    expect(other.opened(6467)).toBe(0);
    expect(other.keys).toEqual([]);
    await driver.send(device, { ...link, host: '192.168.1.31' }, { kind: 'tv.key', key: 'ok' });
    expect(tv.keys).toEqual([{ code: 23, direction: 3 }]);
    expect(reports.every((r) => r.kind === 'tv' && r.state.power)).toBe(true);
    expect(lan.streams.some((s) => s.host === HOST && s.port === 6467)).toBe(false);
  });

  it('says not paired for the attempt when the pinned TV is nowhere, and finds it when it returns', async () => {
    const { tv, tvs, driver, device, link, hostChanged, id } = await setup();
    watch(driver, device, link);
    await tick(10);
    tv.moveTo('192.168.1.31');
    tvs.splice(tvs.indexOf(tv), 1);
    const other = createFakeAtv({ host: HOST, certSha256: 'someone-else' });
    other.trusted.add(id.modulusHex);
    tvs.push(other);
    await tick(30000, 250);
    expect(hostChanged).not.toHaveBeenCalled();
    await expect(driver.send(device, link, { kind: 'tv.key', key: 'ok' })).rejects.toMatchObject({
      code: 'notPaired',
    });
    tvs.push(tv);
    await tick(35000, 250);
    expect(hostChanged).toHaveBeenCalledWith('tv1', '192.168.1.31');
    expect(tv.connections(6466)).toBe(1);
    expect(other.keys).toEqual([]);
  });

  it('searches at most once per 30 s while the TV is nowhere', async () => {
    const { tv, tvs, lan, driver, device, link, id } = await setup();
    watch(driver, device, link);
    await tick(10);
    tv.moveTo('192.168.1.31');
    tvs.splice(tvs.indexOf(tv), 1);
    const other = createFakeAtv({ host: HOST, certSha256: 'someone-else' });
    other.trusted.add(id.modulusHex);
    tvs.push(other);
    await tick(1000, 100);
    const browse = jest.spyOn(lan, 'mdnsBrowse');
    await tick(100000, 500);
    expect(browse.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(browse.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

describe('not paired', () => {
  it('latches once the TV no longer trusts us, until clearNotPaired', async () => {
    const { tv, lan, driver, device, link, id } = await setup();
    watch(driver, device, link);
    await tick(10);
    tv.trusted.clear();
    tv.drop();
    await tick(300, 100);
    const attempts = lan.streams.filter((s) => s.port === 6466).length;
    expect(attempts).toBe(2);
    await tick(300000, 1000);
    expect(lan.streams.filter((s) => s.port === 6466).length).toBe(attempts);
    await expect(driver.send(device, link, { kind: 'tv.key', key: 'ok' })).rejects.toMatchObject({
      code: 'notPaired',
    });
    tv.trusted.add(id.modulusHex);
    driver.clearNotPaired('tv1', link);
    await tick(100);
    expect(tv.connections(6466)).toBe(1);
  });
});

describe('not paired is only for a TV that hung up after TLS', () => {
  /** 6466 answers nothing (until `slow.on` is false): the connect times out. */
  function slowRemotePort(lan: Awaited<ReturnType<typeof setup>>['lan']) {
    const slow = { on: true };
    const real = lan.openStream.bind(lan);
    lan.openStream = (host, port, ms, tls) => {
      if (port === 6466 && slow.on) {
        lan.streams.push({ host, port, tls });
        return new Promise((_res, rej) =>
          setTimeout(() => rej(new DeviceError('notSent', 'timed out')), ms),
        );
      }
      return real(host, port, ms, tls);
    };
    return slow;
  }

  it('does not latch on a 6466 timeout with 6467 up, and connects once the box answers', async () => {
    const { tv, lan, driver, device, link } = await setup();
    const slow = slowRemotePort(lan);
    const { reports } = watch(driver, device, link);
    await tick(20000, 100);
    expect(lan.streams.some((s) => s.port === 6467)).toBe(false);
    expect(lan.streams.filter((s) => s.port === 6466).length).toBeGreaterThan(3);
    slow.on = false;
    await tick(6000, 100);
    expect(tv.connections(6466)).toBe(1);
    expect(reports[reports.length - 1]).toEqual({
      kind: 'tv',
      state: { power: true, volume: 20, muted: false },
    });
    await driver.send(device, link, { kind: 'tv.key', key: 'ok' });
    expect(tv.keys).toHaveLength(1);
  });

  it('a press during the timeout is notSent, not notPaired', async () => {
    const { lan, driver, device, link } = await setup();
    slowRemotePort(lan);
    const p = driver.send(device, link, { kind: 'tv.key', key: 'ok' });
    const assertion = expect(p).rejects.toMatchObject({ code: 'notSent' });
    await tick(2000, 100);
    await assertion;
  });

  it('power on still falls back to Wake-on-LAN after a timeout, and nothing is latched', async () => {
    const { tv, lan, driver, device } = await setup();
    const withMac = linkFor(tv, { mac: 'aa:bb:cc:dd:ee:ff' });
    const dev = deviceOf('tv1', withMac);
    const slow = slowRemotePort(lan);
    const p = driver.send(dev, withMac, { kind: 'tv.powerOn' });
    await tick(2000, 100);
    await p;
    expect(lan.wolPackets).toEqual([magicPacket('aa:bb:cc:dd:ee:ff')]);
    expect(lan.streams.some((s) => s.port === 6467)).toBe(false);
    slow.on = false;
    await driver.send(device, withMac, { kind: 'tv.key', key: 'ok' });
    expect(tv.keys).toHaveLength(1);
  });

  it('the real unpaired case sends no 6467 probe', async () => {
    const { tv, lan, driver, device, link } = await setup();
    tv.trusted.clear();
    await expect(driver.send(device, link, { kind: 'tv.key', key: 'ok' })).rejects.toMatchObject({
      code: 'notPaired',
    });
    expect(lan.streams.some((s) => s.port === 6467)).toBe(false);
  });
});

describe('send and observe', () => {
  it('retries for an observer when a connect started by a send fails', async () => {
    const { tv, tvs, driver, device, link } = await setup();
    tvs.splice(tvs.indexOf(tv), 1);
    const sent = driver.send(device, link, { kind: 'tv.key', key: 'ok' });
    const assertion = expect(sent).rejects.toMatchObject({ code: 'notSent' });
    watch(driver, device, link);
    await tick(100);
    await assertion;
    tvs.push(tv);
    await tick(10000, 100);
    expect(tv.connections(6466)).toBe(1);
  });
});

describe('forget', () => {
  const two = (tv: FakeAtv): Device[] => [
    deviceOf('tv1', linkFor(tv)),
    deviceOf('tv2', linkFor(tv, { host: '192.168.1.21', pinSha256: 'b' })),
  ];

  it('keeps the shared identity while another Android TV uses it', async () => {
    const tv = createFakeAtv({ host: HOST });
    const { driver, lan } = await setup({ devices: async () => [two(tv)[1]!] });
    await driver.forget!(two(tv)[0]!, two(tv)[0]!.links[0]!);
    expect(lan.deleted).toEqual([]);
  });

  it('deletes the identity with the last Android TV, and is fine twice', async () => {
    const { tv, driver, lan, device, link } = await setup({ devices: async () => [] });
    watch(driver, device, link);
    await tick(10);
    await driver.forget!(device, link);
    expect(lan.deleted).toEqual(['androidtv:identity']);
    expect(tv.connections(6466)).toBe(0);
    await driver.forget!(device, link);
    expect(lan.deleted).toEqual(['androidtv:identity', 'androidtv:identity']);
  });

  it('closes a connect that finishes after forget, and arms no timer for it', async () => {
    const { tv, driver, device, link } = await setup();
    const sent = driver.send(device, link, { kind: 'tv.key', key: 'ok' });
    const assertion = expect(sent).rejects.toMatchObject({ code: 'notSent' });
    await driver.forget!(device, link);
    await tick(100);
    await assertion;
    expect(tv.connections(6466)).toBe(0);
    expect(tv.keys).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rethrows a failing deleteIdentity', async () => {
    const { lan, driver, device, link } = await setup();
    lan.deleteIdentity = () => Promise.reject(new Error('key store'));
    await expect(driver.forget!(device, link)).rejects.toThrow('key store');
  });
});

describe('abort', () => {
  it('sends nothing once aborted', async () => {
    const { tv, lan, driver, device, link } = await setup();
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      driver.send(device, link, { kind: 'tv.key', key: 'ok' }, ctl.signal),
    ).rejects.toMatchObject({ code: 'notSent' });
    expect(tv.keys).toEqual([]);
    expect(lan.streams).toEqual([]);
  });
});
