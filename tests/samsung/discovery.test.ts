import { DeviceError } from '@/core';
import {
  discoverSsdp,
  parseSsdpReply,
  probeSamsungHost,
  samsungFromProbe,
  SSDP_SEARCH,
} from '@/samsung/discovery';
import { createFakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv } from '@/samsung/testing/fakeTv';

const HOST = '192.168.1.40';
const MAC = 'aa:bb:cc:dd:ee:ff';

const SAMSUNG_REPLY = [
  'HTTP/1.1 200 OK',
  'ST: urn:samsung.com:device:RemoteControlReceiver:1',
  'USN: uuid:abc-123::urn:samsung.com:device:RemoteControlReceiver:1',
  '',
  '',
].join('\r\n');

describe('parseSsdpReply', () => {
  it('accepts a Samsung reply', () => {
    expect(parseSsdpReply(SAMSUNG_REPLY, HOST)).toEqual({
      kind: 'samsung',
      host: HOST,
      name: 'Samsung TV',
      secure: true,
      usn: 'uuid:abc-123',
    });
  });

  it('accepts a reply with only the USN', () => {
    const r = 'USN: uuid:x::urn:samsung.com:device:RemoteControlReceiver:1\r\n\r\n';
    expect(parseSsdpReply(r, HOST)?.kind).toBe('samsung');
  });

  it('rejects an LG reply and garbage', () => {
    const lg = 'HTTP/1.1 200 OK\r\nST: urn:lge-com:service:webos-second-screen:1\r\n\r\n';
    expect(parseSsdpReply(lg, HOST)).toBeNull();
    expect(parseSsdpReply('garbage', HOST)).toBeNull();
  });

  it('SSDP_SEARCH asks for Samsung and ends with a blank line', () => {
    expect(SSDP_SEARCH).toContain('ST: urn:samsung.com:device:RemoteControlReceiver:1');
    expect(SSDP_SEARCH).toContain('MX: 2');
    expect(SSDP_SEARCH.endsWith('\r\n\r\n')).toBe(true);
  });
});

describe('samsungFromProbe', () => {
  it('needs both ports', () => {
    expect(samsungFromProbe(HOST, new Set([8001]))).toBeNull();
    expect(samsungFromProbe(HOST, new Set([8002]))).toBeNull();
    expect(samsungFromProbe(HOST, new Set())).toBeNull();
    expect(samsungFromProbe(HOST, new Set([8001, 8002]))).toMatchObject({
      kind: 'samsung',
      host: HOST,
      secure: true,
    });
  });
});

describe('probeSamsungHost', () => {
  it('finds the fake TV, rejects junk and an off TV, rethrows notLocal', async () => {
    const tv = createFakeSamsungTv({ host: HOST, mac: MAC });
    const lan = createFakeSamsungLan([tv]);
    await expect(probeSamsungHost(lan, HOST)).resolves.toMatchObject({
      kind: 'samsung',
      host: HOST,
    });
    tv.setInfoBody('<html>');
    await expect(probeSamsungHost(lan, HOST)).resolves.toBeNull();
    tv.setInfoBody(null);
    tv.setPower('off');
    await expect(probeSamsungHost(lan, HOST)).resolves.toBeNull();
    await expect(
      probeSamsungHost({ request: () => Promise.reject(new DeviceError('notLocal')) }, '8.8.8.8'),
    ).rejects.toMatchObject({ code: 'notLocal' });
  });
});

describe('discoverSsdp', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reports a fake TV once and stops after unsubscribe', async () => {
    const tv = createFakeSamsungTv({ host: HOST, mac: MAC });
    const lan = createFakeSamsungLan([tv]);
    const found: string[] = [];
    discoverSsdp(lan, (f) => found.push(f.host));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(found).toEqual([HOST]);

    const more: string[] = [];
    const stop = discoverSsdp(lan, (f) => more.push(f.host));
    stop();
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    expect(more).toEqual([]);
  });
});
