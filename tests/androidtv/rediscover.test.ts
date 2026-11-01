import { findAndroidTvByPin } from '@/androidtv/rediscover';
import { createFakeAtv, type FakeAtv } from '@/androidtv/testing/fakeAtv';
import { createFakeAtvLan } from '@/androidtv/testing/fakeAtvLan';

const link = (tv: FakeAtv, host: string) => ({
  kind: 'androidtv' as const,
  host,
  certRef: 'androidtv:identity',
  pinSha256: tv.certSha256,
});

/** Two TVs, both paired with this phone. A has the cert `a`, B the cert `b`. */
async function twoTvs(o: { mdns?: boolean } = {}) {
  const a = createFakeAtv({ host: '192.168.1.20', certSha256: 'cert-a' });
  const b = createFakeAtv({ host: '192.168.1.30', certSha256: 'cert-b' });
  const lan = createFakeAtvLan({ tvs: [b, a] });
  lan.mdnsEnabled = o.mdns ?? true;
  const id = await lan.ensureIdentity('androidtv:identity', 'One Remote');
  a.trusted.add(id.modulusHex);
  b.trusted.add(id.modulusHex);
  return { a, b, lan };
}

/** Runs the search with fake timers, letting the sources and checks finish. */
async function run<T>(p: Promise<T>): Promise<T> {
  let out: T | undefined;
  let done = false;
  void p.then((v) => {
    out = v;
    done = true;
  });
  for (let i = 0; i < 600 && !done; i++) {
    for (let j = 0; j < 20; j++) await Promise.resolve();
    jest.advanceTimersByTime(50);
  }
  if (!done) throw new Error('search did not finish');
  return out as T;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('A moved: found at its new address; B is refused by the pin', async () => {
  const { a, lan } = await twoTvs();
  const l = link(a, '192.168.1.20');
  a.moveTo('192.168.1.31');
  expect(await run(findAndroidTvByPin(lan, l))).toBe('192.168.1.31');
  const checked = lan.streams.filter((s) => s.port === 6466).map((s) => s.host);
  expect(checked).toContain('192.168.1.30');
  expect(checked).toContain('192.168.1.31');
});

test('with mDNS off, the probe finds it', async () => {
  const { a, lan } = await twoTvs({ mdns: false });
  const l = link(a, '192.168.1.20');
  a.moveTo('192.168.1.31');
  expect(await run(findAndroidTvByPin(lan, l))).toBe('192.168.1.31');
});

test('another TV at the old address is never taken for A', async () => {
  const { a, b, lan } = await twoTvs();
  const l = link(a, '192.168.1.20');
  a.moveTo('192.168.1.31');
  b.moveTo('192.168.1.20');
  expect(await run(findAndroidTvByPin(lan, l))).toBe('192.168.1.31');
});

test('A is gone: null, after at most 5 checks', async () => {
  const tvs = Array.from({ length: 8 }, (_, i) =>
    createFakeAtv({ host: `192.168.1.${String(40 + i)}`, certSha256: `cert-${String(i)}` }),
  );
  const a = createFakeAtv({ host: '192.168.1.20', certSha256: 'cert-a' });
  const lan = createFakeAtvLan({ tvs });
  const id = await lan.ensureIdentity('androidtv:identity', 'One Remote');
  tvs.forEach((t) => t.trusted.add(id.modulusHex));
  expect(await run(findAndroidTvByPin(lan, link(a, '192.168.1.20')))).toBeNull();
  expect(lan.streams.filter((s) => s.port === 6466).length).toBeLessThanOrEqual(5);
});

test('a hanging candidate costs at most checkMs', async () => {
  const a = createFakeAtv({ host: '192.168.1.20', certSha256: 'cert-a' });
  const lan = createFakeAtvLan({ tvs: [a], hang: ['192.168.1.20'] });
  const started = Date.now();
  expect(await run(findAndroidTvByPin(lan, link(a, '192.168.1.20'), { checkMs: 1500 }))).toBeNull();
  // Sources end after 3 s (mDNS window); then the own host costs one check.
  expect(Date.now() - started).toBeLessThanOrEqual(3000 + 1500 + 500);
});

test('it gives up after giveUpMs', async () => {
  const a = createFakeAtv({ host: '192.168.1.20', certSha256: 'cert-a' });
  const lan = createFakeAtvLan({ tvs: [a] });
  const never = { ...lan, mdnsBrowse: () => new Promise<void>(() => undefined) };
  expect(
    await run(findAndroidTvByPin(never, link(a, '192.168.1.20'), { giveUpMs: 5000 })),
  ).toBeNull();
});
