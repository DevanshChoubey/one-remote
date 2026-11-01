import { PairError, type FoundTv, type PairPrompts } from '@/core';
import { pairAndroidTv } from '@/androidtv/pair';
import { createFakeAtv } from '@/androidtv/testing/fakeAtv';
import { createFakeAtvLan } from '@/androidtv/testing/fakeAtvLan';

const HOST = '192.168.1.20';
const found = (o: Partial<FoundTv> = {}): FoundTv => ({
  kind: 'androidtv',
  host: HOST,
  name: 'Living Room TV',
  secure: true,
  ...o,
});

function setup(o: Partial<Parameters<typeof createFakeAtv>[0]> = {}) {
  const tv = createFakeAtv({ host: HOST, ...o });
  const lan = createFakeAtvLan({ tvs: [tv] });
  return { tv, lan };
}
/** Prompts that answer each askCode from `answers` (a function of the fake TV). */
function prompts(answer: (n: number) => string | null | Promise<string | null>) {
  const calls: boolean[] = [];
  const p: PairPrompts = {
    onAllow: () => undefined,
    askCode: async (wrong) => {
      calls.push(wrong);
      return answer(calls.length);
    },
  };
  return { p, calls };
}
const flipFirst = (code: string): string => `${code[0] === '0' ? '1' : '0'}${code.slice(1)}`;

afterEach(() => jest.useRealTimers());

test('a good code pairs, and the link pins the certificate', async () => {
  const { tv, lan } = setup();
  const { p, calls } = prompts(() => tv.shownCode());
  const paired = await pairAndroidTv(lan, found(), p);
  expect(paired.link).toEqual({
    kind: 'androidtv',
    host: HOST,
    certRef: 'androidtv:identity',
    pinSha256: 'atv-192.168.1.20',
  });
  expect(paired.suggestedName).toBe('Living Room TV');
  expect(calls).toEqual([false]);
  expect(tv.connections(6467)).toBe(0);
  expect(tv.connections(6466)).toBe(0);
});

test('the MAC comes from the certificate subject when it has one', async () => {
  const { tv, lan } = setup({ subject: 'CN=atvremote/BRAVIA/AA-BB-CC-DD-EE-FF' });
  const paired = await pairAndroidTv(lan, found(), prompts(() => tv.shownCode()).p);
  expect(paired.link).toMatchObject({ mac: 'aa:bb:cc:dd:ee:ff' });
  const plain = setup();
  const p2 = await pairAndroidTv(plain.lan, found(), prompts(() => plain.tv.shownCode()).p);
  expect(p2.link).not.toHaveProperty('mac');
});

test('a wrong code is caught locally: askCode(true), nothing sent to the TV', async () => {
  const { tv, lan } = setup();
  const { p, calls } = prompts((n) => (n === 1 ? flipFirst(tv.shownCode()!) : tv.shownCode()));
  await pairAndroidTv(lan, found(), p);
  expect(calls).toEqual([false, true]);
  expect(tv.opened(6467)).toBe(1);
  expect(tv.trusted.size).toBe(1);
});

test('lower case with spaces pairs; a non-hex letter asks again without sending', async () => {
  const { tv, lan } = setup();
  const messy = (): string => ` ${tv.shownCode()!.toLowerCase().replace(/(..)/, '$1 ')} `;
  const { p, calls } = prompts((n) => (n === 1 ? '2A3A7G' : messy()));
  await pairAndroidTv(lan, found(), p);
  expect(calls).toEqual([false, true]);
  expect(tv.opened(6467)).toBe(1);
});

test('the TV refusing the secret starts again with a new stream', async () => {
  const { tv, lan } = setup();
  tv.rejectNextSecret();
  const { p, calls } = prompts(() => tv.shownCode());
  const paired = await pairAndroidTv(lan, found(), p);
  expect(calls).toEqual([false, true]);
  expect(tv.opened(6467)).toBe(2);
  expect(paired.link.kind).toBe('androidtv');
});

test('a TV that refuses pairing is denied', async () => {
  const { tv, lan } = setup();
  tv.refusePairing();
  await expect(pairAndroidTv(lan, found(), prompts(() => null).p)).rejects.toMatchObject({
    code: 'denied',
  });
  expect(tv.connections(6467)).toBe(0);
});

test('a silent TV times out after stepMs', async () => {
  jest.useFakeTimers();
  const { tv, lan } = setup();
  const real = lan.openStream.bind(lan);
  lan.openStream = async (...a) => {
    const s = await real(...a);
    tv.stopAnswering();
    return s;
  };
  const p = pairAndroidTv(lan, found(), prompts(() => null).p, { stepMs: 5000 });
  const assertion = expect(p).rejects.toMatchObject({ code: 'timeout' });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  jest.advanceTimersByTime(4999);
  await Promise.resolve();
  jest.advanceTimersByTime(1);
  await assertion;
  expect(tv.connections(6467)).toBe(0);
});

test('askCode resolving null cancels and closes the stream', async () => {
  const { tv, lan } = setup();
  const err = await pairAndroidTv(lan, found(), prompts(() => null).p).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(PairError);
  expect((err as PairError).code).toBe('cancelled');
  expect(tv.connections(6467)).toBe(0);
});

test('an unknown host is unreachable; a public address is notLocal', async () => {
  const { lan } = setup();
  await expect(
    pairAndroidTv(lan, found({ host: '192.168.1.99' }), prompts(() => null).p),
  ).rejects.toMatchObject({ code: 'unreachable' });
  await expect(
    pairAndroidTv(lan, found({ host: '8.8.8.8' }), prompts(() => null).p),
  ).rejects.toMatchObject({ code: 'notLocal' });
});

test('the TV closing while the user types times out once the code arrives', async () => {
  const { tv, lan } = setup();
  const { p } = prompts(() => {
    const code = tv.shownCode()!;
    tv.drop();
    return code;
  });
  await expect(pairAndroidTv(lan, found(), p)).rejects.toMatchObject({ code: 'timeout' });
});

test('names: the mDNS name is kept; a default name takes the TV name, then vendor and model', async () => {
  const a = setup();
  expect(
    (await pairAndroidTv(a.lan, found({ name: 'Android TV' }), prompts(() => a.tv.shownCode()).p))
      .suggestedName,
  ).toBe('atv-192.168.1.20');
  const b = setup({ omitServerName: true, vendor: 'Sony', model: 'BRAVIA' });
  expect(
    (await pairAndroidTv(b.lan, found({ name: 'Android TV' }), prompts(() => b.tv.shownCode()).p))
      .suggestedName,
  ).toBe('Sony BRAVIA');
});

test('pairing again keeps the stored certRef', async () => {
  const { tv, lan } = setup();
  const reuse = {
    kind: 'androidtv' as const,
    host: HOST,
    certRef: 'androidtv:old',
    pinSha256: 'x',
  };
  const paired = await pairAndroidTv(lan, found(), prompts(() => tv.shownCode()).p, { reuse });
  expect(paired.link).toMatchObject({ certRef: 'androidtv:old' });
});
