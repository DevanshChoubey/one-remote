import { androidTvFromProbe, discoverAndroidTvs, probeAndroidTv } from '@/androidtv/discovery';
import { createFakeAtv } from '@/androidtv/testing/fakeAtv';
import { createFakeAtvLan } from '@/androidtv/testing/fakeAtvLan';
import type { FoundTv } from '@/core';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

afterEach(() => jest.useRealTimers());

test('an mDNS service becomes one found TV with its name', async () => {
  jest.useFakeTimers();
  const tv = createFakeAtv({ host: '192.168.1.20', name: 'Living Room TV' });
  const lan = createFakeAtvLan({ tvs: [tv] });
  const found: FoundTv[] = [];
  discoverAndroidTvs(lan, (f) => found.push(f));
  await flush();
  expect(found).toEqual([
    { kind: 'androidtv', host: '192.168.1.20', name: 'Living Room TV', secure: true },
  ]);
});

test('a service without a name is called Android TV, and unsubscribe stops reports', async () => {
  const found: FoundTv[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  const stop = discoverAndroidTvs(
    {
      mdnsBrowse: async (_t, _ms, on) => {
        on({ name: '', host: '10.0.0.4', port: 6466, txt: {} });
        await gate;
        on({ name: 'late', host: '10.0.0.5', port: 6466, txt: {} });
      },
    },
    (f) => found.push(f),
  );
  await flush();
  stop();
  release();
  await flush();
  expect(found.map((f) => f.name)).toEqual(['Android TV']);
});

test('a browse error gives nothing and no throw', async () => {
  const found: FoundTv[] = [];
  discoverAndroidTvs({ mdnsBrowse: () => Promise.reject(new Error('no mdns')) }, (f) =>
    found.push(f),
  );
  await flush();
  expect(found).toEqual([]);
});

test('androidTvFromProbe wants 6466', () => {
  expect(androidTvFromProbe('10.0.0.4', new Set([6466]))).toMatchObject({ kind: 'androidtv' });
  expect(androidTvFromProbe('10.0.0.4', new Set([6467]))).toBeNull();
});

test('probeAndroidTv: up gives a TV, unknown gives null, a public address is notLocal', async () => {
  const tv = createFakeAtv({ host: '192.168.1.20' });
  const lan = createFakeAtvLan({ tvs: [tv] });
  expect(await probeAndroidTv(lan, '192.168.1.20')).toMatchObject({
    kind: 'androidtv',
    host: '192.168.1.20',
  });
  expect(tv.connections(6467)).toBe(0);
  expect(await probeAndroidTv(lan, '192.168.1.99')).toBeNull();
  await expect(probeAndroidTv(lan, '8.8.8.8')).rejects.toMatchObject({ code: 'notLocal' });
});
