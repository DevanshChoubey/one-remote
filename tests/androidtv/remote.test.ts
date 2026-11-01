import { AtvRemote } from '@/androidtv/remote';
import { KEYCODE, KEYCODE_SEARCH } from '@/androidtv/keys';
import { createFakeAtv, type FakeAtv } from '@/androidtv/testing/fakeAtv';
import { createFakeAtvLan, type FakeAtvLan } from '@/androidtv/testing/fakeAtvLan';

const HOST = '192.168.1.20';
const link = { host: HOST, certRef: 'androidtv:identity' };

/** Pairs the phone identity with the fake the quick way: the TV just trusts it. */
async function trusted(): Promise<{ tv: FakeAtv; lan: FakeAtvLan }> {
  const tv = createFakeAtv({ host: HOST });
  const lan = createFakeAtvLan({ tvs: [tv] });
  const id = await lan.ensureIdentity(link.certRef, 'One Remote');
  tv.trusted.add(id.modulusHex);
  return { tv, lan };
}
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const live: AtvRemote[] = [];
async function open(lan: FakeAtvLan, tv: FakeAtv): Promise<AtvRemote> {
  const r = await AtvRemote.connect(lan, { ...link, pinSha256: tv.certSha256 }, 1000);
  live.push(r);
  return r;
}

afterEach(() => {
  live.splice(0).forEach((r) => r.close());
  jest.useRealTimers();
});

test('connect resolves with power on and sends configure 111 (the TV offers 623)', async () => {
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  expect(r.live.power).toBe(true);
  expect(tv.configures).toEqual([111]);
  expect(r.certSha256).toBe(tv.certSha256);
  expect(r.model).toBe(tv.name);
  expect(r.vendor).toBe('Fake');
  r.close();
});

test('pings are answered with the same val1', async () => {
  const { tv, lan } = await trusted();
  await open(lan, tv);
  tv.ping(7);
  tv.ping(-1);
  await settle();
  expect(tv.pongs).toEqual([7, -1]);
});

test('key writes a SHORT key', async () => {
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  r.key(KEYCODE.up);
  expect(tv.keys).toEqual([{ code: 19, direction: 3 }]);
});

test('text needs an open field', async () => {
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  expect(() => r.text('news')).toThrow('No text field is open on the TV');
  tv.openTextField(4, 9);
  await settle();
  r.text('news');
  expect(tv.imeEdits).toEqual([{ imeCounter: 4, fieldCounter: 9, value: 'news' }]);
});

test('volume and app reach live, and onLive fires only on a change', async () => {
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  const seen: unknown[] = [];
  r.onLive((l) => seen.push(l));
  tv.setVolume(23, 50, false);
  await settle();
  expect(r.live.volume).toBe(46);
  expect(seen).toHaveLength(1);
  tv.setVolume(23, 50, false);
  await settle();
  expect(seen).toHaveLength(1);
  tv.setApp('com.netflix.ninja');
  await settle();
  expect(r.live.app).toBe('Netflix');
  tv.setApp('x.y');
  await settle();
  expect(r.live).not.toHaveProperty('app');
  tv.setPower(false);
  await settle();
  expect(r.live.power).toBe(false);
});

test('a silent TV closes the session after 16000 ms, not before', async () => {
  jest.useFakeTimers();
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  const onClose = jest.fn();
  r.onClose(onClose);
  tv.stopAnswering();
  jest.advanceTimersByTime(15999);
  expect(onClose).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('any message from the TV restarts the silence timer', async () => {
  jest.useFakeTimers();
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  const onClose = jest.fn();
  r.onClose(onClose);
  for (let i = 0; i < 4; i++) {
    jest.advanceTimersByTime(10000);
    tv.ping(i);
    await Promise.resolve();
    await Promise.resolve();
  }
  expect(onClose).not.toHaveBeenCalled();
});

test('drop fires onClose once; key after close throws notSent', async () => {
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  const onClose = jest.fn();
  r.onClose(onClose);
  tv.drop();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(() => r.key(19)).toThrow(expect.objectContaining({ code: 'notSent' }));
});

test('our own close does not fire onClose', async () => {
  const { tv, lan } = await trusted();
  const r = await open(lan, tv);
  const onClose = jest.fn();
  r.onClose(onClose);
  r.close();
  expect(onClose).not.toHaveBeenCalled();
  expect(tv.connections(6466)).toBe(0);
});

test('an untrusted identity rejects, a wrong pin is notPaired', async () => {
  const tv = createFakeAtv({ host: HOST });
  const lan = createFakeAtvLan({ tvs: [tv] });
  await lan.ensureIdentity(link.certRef, 'One Remote');
  await expect(
    AtvRemote.connect(lan, { ...link, pinSha256: tv.certSha256 }, 1000),
  ).rejects.toMatchObject({
    code: 'notSent',
  });
  await expect(AtvRemote.connect(lan, { ...link, pinSha256: 'other' }, 1000)).rejects.toMatchObject(
    {
      code: 'notPaired',
    },
  );
});

test('connect times out when the TV never sends start', async () => {
  jest.useFakeTimers();
  const { tv, lan } = await trusted();
  const real = lan.openStream.bind(lan);
  lan.openStream = async (...a) => {
    const s = await real(...a);
    tv.stopAnswering();
    return s;
  };
  const p = open(lan, tv);
  const assertion = expect(p).rejects.toMatchObject({ code: 'notSent' });
  await settle();
  jest.advanceTimersByTime(1000);
  await assertion;
});

test('pairing mode accepts any certificate and reports its pin', async () => {
  const { tv, lan } = await trusted();
  const r = await AtvRemote.connect(lan, link, 1000, { pairing: true });
  live.push(r);
  expect(r.certSha256).toBe(tv.certSha256);
  expect(lan.streams[0]?.tls).toEqual({ identity: link.certRef, pairing: true });
});

test('a failed write closes the stream', async () => {
  const { tv, lan } = await trusted();
  const real = lan.openStream.bind(lan);
  const closes = jest.fn();
  let failNext = false;
  lan.openStream = async (...a) => {
    const s = await real(...a);
    const close = s.close.bind(s);
    return {
      ...s,
      write: (bytes: Uint8Array) => {
        if (failNext) throw new Error('boom');
        s.write(bytes);
      },
      close: () => {
        closes();
        close();
      },
    };
  };
  const r = await open(lan, tv);
  failNext = true;
  expect(() => r.key(19)).toThrow(expect.objectContaining({ code: 'notSent' }));
  expect(closes).toHaveBeenCalledTimes(1);
  expect(tv.connections(6466)).toBe(0);
});

describe('voice', () => {
  it('startVoice sends the search key and resolves with the TV session id', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    expect(r.voiceSupported).toBe(true);
    await expect(r.startVoice()).resolves.toBe(7);
    expect(tv.keys).toEqual([{ code: KEYCODE_SEARCH, direction: 3 }]);
    await settle();
    expect(tv.voice.begins).toEqual([7]);
  });

  it('splits 50000 bytes into 20480 + 20480 + 9040', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    const id = await r.startVoice();
    const pcm = Uint8Array.from({ length: 50000 }, (_, i) => i % 251);
    r.sendVoice(id, pcm);
    await settle();
    expect(tv.voice.payloads.map((p) => p.samples.length)).toEqual([20480, 20480, 9040]);
    expect(tv.voice.payloads.every((p) => p.sessionId === 7)).toBe(true);
    const joined = tv.voice.payloads.flatMap((p) => [...p.samples]);
    expect(joined).toEqual([...pcm]);
  });

  it('pads a message under 8192 bytes with zeros', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    const id = await r.startVoice();
    r.sendVoice(id, new Uint8Array(1000).fill(9));
    await settle();
    const [only] = tv.voice.payloads;
    expect(tv.voice.payloads).toHaveLength(1);
    expect(only!.samples).toHaveLength(8192);
    expect([...only!.samples.subarray(0, 1000)].every((b) => b === 9)).toBe(true);
    expect([...only!.samples.subarray(1000)].every((b) => b === 0)).toBe(true);
  });

  it('sends nothing for empty audio', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    const id = await r.startVoice();
    r.sendVoice(id, new Uint8Array(0));
    await settle();
    expect(tv.voice.payloads).toHaveLength(0);
  });

  it('endVoice ends the session once and frees the slot', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    const id = await r.startVoice();
    r.endVoice(id);
    r.endVoice(id);
    await settle();
    expect(tv.voice.ends).toEqual([7]);
    expect(() => r.sendVoice(id, new Uint8Array(10))).toThrow(
      expect.objectContaining({ code: 'notSent' }),
    );
    await expect(r.startVoice()).resolves.toBe(7);
  });

  it('a second startVoice while one is open throws notSent', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    await r.startVoice();
    await expect(r.startVoice()).rejects.toMatchObject({ code: 'notSent' });
  });

  it('a second startVoice while one is starting throws notSent', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    const first = r.startVoice();
    await expect(r.startVoice()).rejects.toMatchObject({ code: 'notSent' });
    await expect(first).resolves.toBe(7);
  });

  it('startVoice times out at 2000 ms when the TV is silent', async () => {
    jest.useFakeTimers();
    const tv = createFakeAtv({ host: HOST, voiceAnswers: false });
    const lan = createFakeAtvLan({ tvs: [tv] });
    const id = await lan.ensureIdentity(link.certRef, 'One Remote');
    tv.trusted.add(id.modulusHex);
    const r = await open(lan, tv);
    const done = jest.fn();
    const p = r.startVoice().catch((e: unknown) => done(e));
    jest.advanceTimersByTime(1999);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await p;
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ code: 'notSent' }));
    // The slot is free again.
    expect(() => r.sendVoice(7, new Uint8Array(1))).toThrow();
  });

  it('is unsupported when the TV lacks the voice bit', async () => {
    const tv = createFakeAtv({ host: HOST, features: 103 });
    const lan = createFakeAtvLan({ tvs: [tv] });
    const id = await lan.ensureIdentity(link.certRef, 'One Remote');
    tv.trusted.add(id.modulusHex);
    const r = await open(lan, tv);
    expect(r.voiceSupported).toBe(false);
    await expect(r.startVoice()).rejects.toMatchObject({ code: 'notSent' });
    expect(tv.keys).toEqual([]);
  });

  it('startVoice rejects when the stream closes while waiting', async () => {
    const tv = createFakeAtv({ host: HOST, voiceAnswers: false });
    const lan = createFakeAtvLan({ tvs: [tv] });
    const id = await lan.ensureIdentity(link.certRef, 'One Remote');
    tv.trusted.add(id.modulusHex);
    const r = await open(lan, tv);
    const p = r.startVoice();
    tv.drop();
    await expect(p).rejects.toMatchObject({ code: 'notSent' });
  });

  it('sendVoice after the stream dropped throws notSent', async () => {
    const { tv, lan } = await trusted();
    const r = await open(lan, tv);
    const id = await r.startVoice();
    tv.drop();
    expect(() => r.sendVoice(id, new Uint8Array(10))).toThrow(
      expect.objectContaining({ code: 'notSent' }),
    );
    expect(() => r.endVoice(id)).not.toThrow();
  });
});
