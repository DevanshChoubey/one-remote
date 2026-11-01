import { DeviceError } from '@/core';
import { keyFrame, parseEvent, textFrame } from '@/samsung/frames';
import { createFakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv } from '@/samsung/testing/fakeTv';
import { infoUrl, socketUrl } from '@/samsung/url';
import type { TvSocket } from '@/tv/transport';

const HOST = '192.168.1.40';
const MAC = 'aa:bb:cc:dd:ee:ff';

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup(opts: Partial<Parameters<typeof createFakeSamsungTv>[0]> = {}) {
  const tv = createFakeSamsungTv({ host: HOST, mac: MAC, ...opts });
  const lan = createFakeSamsungLan([tv]);
  return { tv, lan };
}

function listen(sock: TvSocket): { events: string[]; closed: () => boolean } {
  const events: string[] = [];
  let closed = false;
  sock.onMessage((text) => {
    const e = parseEvent(text);
    events.push(e?.event === 'ms.channel.connect' ? `connect:${e.token}` : (e?.event ?? 'junk'));
  });
  sock.onClose(() => {
    closed = true;
  });
  return { events, closed: () => closed };
}

describe('fake Samsung TV', () => {
  it('holds a pairing open until allow(), then sends the token', async () => {
    const { tv, lan } = setup();
    const sock = await lan.open(socketUrl(HOST, ''), 1000, { pairing: true });
    expect(sock.certSha256).toBe(tv.certSha256);
    const l = listen(sock);
    await settle();
    expect(l.events).toEqual([]);
    tv.allow();
    await settle();
    expect(l.events).toEqual(['connect:12345678']);
    expect(lan.opened).toEqual([socketUrl(HOST, '')]);
  });

  it('answers a known token at once; revokeToken makes it prompt again', async () => {
    const { tv, lan } = setup();
    const a = listen(
      await lan.open(socketUrl(HOST, '12345678'), 1000, { pinSha256: tv.certSha256 }),
    );
    await settle();
    expect(a.events).toEqual(['connect:12345678']);
    tv.revokeToken();
    const b = listen(
      await lan.open(socketUrl(HOST, '12345678'), 1000, { pinSha256: tv.certSha256 }),
    );
    await settle();
    expect(b.events).toEqual([]);
  });

  it('prompt allow answers at once; noToken sends an empty token', async () => {
    const { lan } = setup({ prompt: 'allow', noToken: true });
    const l = listen(await lan.open(socketUrl(HOST, ''), 1000, { pairing: true }));
    await settle();
    expect(l.events).toEqual(['connect:']);
  });

  it('deny() sends unauthorized and closes the socket', async () => {
    const { tv, lan } = setup();
    const l = listen(await lan.open(socketUrl(HOST, ''), 1000, { pairing: true }));
    tv.deny();
    await settle();
    expect(l.events).toEqual(['ms.channel.unauthorized']);
    expect(l.closed()).toBe(true);
    expect(tv.connections()).toBe(0);
  });

  it('records key and text frames', async () => {
    const { tv, lan } = setup({ prompt: 'allow' });
    const sock = await lan.open(socketUrl(HOST, ''), 1000, { pairing: true });
    await settle();
    sock.send(keyFrame('KEY_HOME'));
    sock.send(textFrame('नमस्ते 🙂'));
    expect(tv.keys).toEqual(['KEY_HOME']);
    expect(tv.texts).toEqual(['नमस्ते 🙂']);
    expect(tv.connections()).toBe(1);
  });

  it('stayQuiet keeps the socket open with no connect event', async () => {
    const { tv, lan } = setup({ prompt: 'allow' });
    tv.stayQuiet(true);
    const l = listen(await lan.open(socketUrl(HOST, ''), 1000, { pairing: true }));
    await settle();
    expect(l.events).toEqual([]);
    expect(l.closed()).toBe(false);
  });

  it('drop() closes open sockets from the TV side', async () => {
    const { tv, lan } = setup({ prompt: 'allow' });
    const sock = await lan.open(socketUrl(HOST, ''), 1000, { pairing: true });
    const l = listen(sock);
    tv.drop();
    expect(l.closed()).toBe(true);
    expect(() => sock.send(keyFrame('KEY_UP'))).toThrow();
  });

  it('standby: info says standby, wss refused; off: both refused', async () => {
    const { tv, lan } = setup();
    tv.setPower('standby');
    const res = await lan.request({ method: 'GET', url: infoUrl(HOST), timeoutMs: 1000 });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      device: { PowerState: 'standby', wifiMac: 'AA:BB:CC:DD:EE:FF' },
    });
    await expect(lan.open(socketUrl(HOST, ''), 1000, { pairing: true })).rejects.toMatchObject({
      code: 'notSent',
    });
    tv.setPower('off');
    await expect(
      lan.request({ method: 'GET', url: infoUrl(HOST), timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: 'notSent' });
    await expect(lan.open(socketUrl(HOST, ''), 1000, { pairing: true })).rejects.toMatchObject({
      code: 'notSent',
    });
    expect(tv.infoRequests()).toBe(2);
  });

  it('serves a replacement info body', async () => {
    const { tv, lan } = setup();
    tv.setInfoBody('<html>');
    const res = await lan.request({ method: 'GET', url: infoUrl(HOST), timeoutMs: 1000 });
    expect(res.body).toBe('<html>');
  });

  it('refuses a wrong pin and no pin with notPaired', async () => {
    const { lan } = setup();
    await expect(lan.open(socketUrl(HOST, ''), 1000, { pinSha256: 'other' })).rejects.toEqual(
      expect.any(DeviceError),
    );
    await expect(lan.open(socketUrl(HOST, ''), 1000, { pinSha256: 'other' })).rejects.toMatchObject(
      {
        code: 'notPaired',
      },
    );
    await expect(lan.open(socketUrl(HOST, ''), 1000)).rejects.toMatchObject({ code: 'notPaired' });
  });

  it('moveTo makes the old host refuse and the new one answer', async () => {
    const { tv, lan } = setup({ prompt: 'allow' });
    tv.moveTo('192.168.1.99');
    await expect(lan.open(socketUrl(HOST, ''), 1000, { pairing: true })).rejects.toMatchObject({
      code: 'notSent',
    });
    await expect(
      lan.open(socketUrl('192.168.1.99', ''), 1000, { pairing: true }),
    ).resolves.toBeDefined();
    expect(tv.host).toBe('192.168.1.99');
  });

  it('ssdpSearch and probe report the TV only when not off', async () => {
    jest.useFakeTimers();
    try {
      const { tv, lan } = setup();
      const replies: [string, string][] = [];
      const done = lan.ssdpSearch('M-SEARCH', 100, (text, from) => replies.push([text, from]));
      await settle();
      jest.advanceTimersByTime(100);
      await done;
      expect(replies).toHaveLength(1);
      expect(replies[0]?.[0]).toContain('ST: urn:samsung.com:device:RemoteControlReceiver:1');
      expect(replies[0]?.[0]).toMatch(/USN: uuid:\S+::/);
      expect(replies[0]?.[0]).toContain('LOCATION:');
      expect(replies[0]?.[1]).toBe(HOST);

      const hosts: [string, number[]][] = [];
      const p = lan.probe(
        [8001, 8002, 3000],
        50,
        () => undefined,
        undefined,
        (h, ports) => hosts.push([h, ports]),
      );
      await settle();
      jest.advanceTimersByTime(50);
      await p;
      expect(hosts).toEqual([[HOST, [8001, 8002]]]);
      expect(lan.probes).toEqual([[8001, 8002, 3000]]);

      tv.setPower('off');
      const none: string[] = [];
      const d2 = lan.ssdpSearch('M-SEARCH', 100, (t) => none.push(t));
      const p2 = lan.probe([8001, 8002], 50, (h) => none.push(h));
      await settle();
      jest.advanceTimersByTime(100);
      await Promise.all([d2, p2]);
      expect(none).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps WoL packets and the Wi-Fi answer', async () => {
    const { lan } = setup();
    await lan.sendWol(new Uint8Array([1]));
    expect(lan.wol).toHaveLength(1);
    lan.onWifiResult = false;
    await expect(lan.onWifi()).resolves.toBe(false);
  });
});
