import { DeviceError } from '@/core';
import type { FoundTv } from '@/core/tvSetup';
import { discoverTvs, parseSsdpReply, probeHost, SSDP_SEARCH } from '@/webos/discovery';
import { createFakeLan } from '@/webos/testing/fakeLan';
import { createFakeTv } from '@/webos/testing/fakeTv';
import type { TvTransport } from '@/webos/transport';

const C4_REPLY = [
  'HTTP/1.1 200 OK',
  'CACHE-CONTROL: max-age=1800',
  'ST: urn:lge-com:service:webos-second-screen:1',
  'USN: uuid:1234::urn:lge-com:service:webos-second-screen:1',
  'DLNADeviceName.lge.com: %5BLG%5D%20webOS%20TV%20OLED55C4',
  '',
  '',
].join('\r\n');

const ROKU_REPLY = [
  'HTTP/1.1 200 OK',
  'ST: roku:ecp',
  'USN: uuid:roku:ecp:YN00AB',
  'LOCATION: http://192.168.1.50:8060/',
  '',
  '',
].join('\r\n');

describe('SSDP_SEARCH', () => {
  it('is an M-SEARCH for the webOS second screen', () => {
    expect(SSDP_SEARCH).toBe(
      [
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        'MX: 2',
        'ST: urn:lge-com:service:webos-second-screen:1',
        '',
        '',
      ].join('\r\n'),
    );
  });
});

describe('parseSsdpReply', () => {
  it('reads a C4-style reply', () => {
    expect(parseSsdpReply(C4_REPLY, '192.168.1.23')).toEqual({
      host: '192.168.1.23',
      name: 'webOS TV OLED55C4',
      secure: false,
      usn: 'uuid:1234',
    });
  });

  it('ignores a Roku', () => {
    expect(parseSsdpReply(ROKU_REPLY, '192.168.1.50')).toBeNull();
  });

  it('accepts a match on USN alone, any header case, and falls back to LG TV', () => {
    const text =
      'HTTP/1.1 200 OK\r\nusn: uuid:abcd::urn:lge-com:service:webos-second-screen:1\r\n\r\n';
    expect(parseSsdpReply(text, '10.0.0.4')).toEqual({
      host: '10.0.0.4',
      name: 'LG TV',
      secure: false,
      usn: 'uuid:abcd',
    });
  });

  it('keeps a USN without :: whole, and survives a bad name encoding', () => {
    const text = [
      'HTTP/1.1 200 OK',
      'ST: urn:lge-com:service:webos-second-screen:1',
      'USN: uuid:solo',
      'DLNADeviceName.lge.com: %E0%A4%A',
      '',
    ].join('\r\n');
    expect(parseSsdpReply(text, '10.0.0.4')).toEqual({
      host: '10.0.0.4',
      name: '%E0%A4%A',
      secure: false,
      usn: 'uuid:solo',
    });
  });

  it('omits usn when the reply has none', () => {
    const text = 'HTTP/1.1 200 OK\r\nST: urn:lge-com:service:webos-second-screen:1\r\n\r\n';
    expect(parseSsdpReply(text, '10.0.0.4')).toEqual({
      host: '10.0.0.4',
      name: 'LG TV',
      secure: false,
    });
  });
});

describe('discoverTvs', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reports a TV found by both SSDP and the probe once', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: 'aa:bb:cc:00:11:22', usn: 'uuid:1234' });
    const lan = createFakeLan({ tvs: [tv] });
    const found: FoundTv[] = [];
    discoverTvs(lan, (t) => found.push(t));
    await jest.advanceTimersByTimeAsync(3000);
    expect(found).toEqual([
      { host: '192.168.1.23', name: 'webOS TV OLED55C4', secure: false, usn: 'uuid:1234' },
    ]);
  });

  it('finds a TV by the probe alone when SSDP is silent', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: 'aa:bb:cc:00:11:22' });
    const lan = createFakeLan({ tvs: [tv] });
    lan.ssdpEnabled = false;
    const found: FoundTv[] = [];
    discoverTvs(lan, (t) => found.push(t));
    await jest.advanceTimersByTimeAsync(3000);
    expect(found).toEqual([{ host: '192.168.1.23', name: 'LG TV', secure: false }]);
  });

  it('marks a host secure only when 3000 is closed and 3001 is open', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: 'aa:bb:cc:00:11:22', secure: true });
    const lan = createFakeLan({ tvs: [tv] });
    lan.ssdpEnabled = false;
    const found: FoundTv[] = [];
    discoverTvs(lan, (t) => found.push(t));
    await jest.advanceTimersByTimeAsync(3000);
    expect(found).toEqual([{ host: '192.168.1.23', name: 'LG TV', secure: true }]);
  });

  it('does not mark a host secure when 3000 is open too', async () => {
    const found: FoundTv[] = [];
    const t = {
      ...createFakeLan({ tvs: [] }),
      probe: (_p: number[], _ms: number, onOpen: (h: string, p: number) => void) => {
        onOpen('192.168.1.9', 3001);
        onOpen('192.168.1.9', 3000);
        return Promise.resolve();
      },
    };
    discoverTvs(t, (tv) => found.push(tv));
    await jest.advanceTimersByTimeAsync(3000);
    expect(found).toEqual([{ host: '192.168.1.9', name: 'LG TV', secure: false }]);
  });

  it('stops reporting after unsubscribe, and reports done when both searches end', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: 'aa:bb:cc:00:11:22' });
    const lan = createFakeLan({ tvs: [tv] });
    const found: FoundTv[] = [];
    const done = jest.fn();
    const stop = discoverTvs(lan, (t) => found.push(t), { onDone: done });
    stop();
    await jest.advanceTimersByTimeAsync(3000);
    expect(found).toEqual([]);

    const done2 = jest.fn();
    discoverTvs(lan, () => undefined, { onDone: done2, ssdpMs: 2000, probeMs: 500 });
    await jest.advanceTimersByTimeAsync(1999);
    expect(done2).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(done2).toHaveBeenCalledTimes(1);
  });

  it('survives a transport that throws', async () => {
    const t: TvTransport = {
      ...createFakeLan({ tvs: [] }),
      ssdpSearch: () => Promise.reject(new DeviceError('notSent')),
      probe: () => Promise.reject(new DeviceError('notSent')),
    };
    const done = jest.fn();
    discoverTvs(t, () => undefined, { onDone: done });
    await jest.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('probeHost', () => {
  it('finds a plain TV', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: 'aa:bb:cc:00:11:22' });
    await expect(probeHost(createFakeLan({ tvs: [tv] }), '192.168.1.23')).resolves.toEqual({
      host: '192.168.1.23',
      name: 'LG TV',
      secure: false,
    });
  });

  it('finds a secure-only TV', async () => {
    const tv = createFakeTv({ host: '192.168.1.23', mac: 'aa:bb:cc:00:11:22', secure: true });
    await expect(probeHost(createFakeLan({ tvs: [tv] }), '192.168.1.23')).resolves.toEqual({
      host: '192.168.1.23',
      name: 'LG TV',
      secure: true,
    });
  });

  it('returns null when nothing answers', async () => {
    await expect(probeHost(createFakeLan({ tvs: [] }), '192.168.1.99')).resolves.toBeNull();
  });

  it('throws notLocal for an address off the home network', async () => {
    const t: TvTransport = {
      ...createFakeLan({ tvs: [] }),
      open: () => Promise.reject(new DeviceError('notLocal')),
    };
    await expect(probeHost(t, '8.8.8.8')).rejects.toMatchObject({ code: 'notLocal' });
  });
});
