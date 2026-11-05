import type { Device, FoundTv } from '@/core';
import { createSamsungBrand } from '@/samsung/setup';
import { createFakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv } from '@/samsung/testing/fakeTv';
import { createCompositeTvSetup } from '@/tv/setup';
import type { TvSecretsWithDelete } from '@/tv/transport';
import { createWebosBrand } from '@/webos/setup';

const HOST = '192.168.1.40';
const NEW_HOST = '192.168.1.99';
const MAC = 'aa:bb:cc:dd:ee:ff';
const PROMPTS = { onAllow: () => undefined, askCode: () => Promise.resolve(null) };

function memSecrets(seed: Record<string, string> = {}): TvSecretsWithDelete {
  const map = new Map(Object.entries(seed));
  return {
    get: (r) => Promise.resolve(map.get(r) ?? null),
    set: (r, v) => {
      map.set(r, v);
      return Promise.resolve();
    },
    delete: (r) => {
      map.delete(r);
      return Promise.resolve();
    },
  };
}

function rig(seed: Record<string, string> = {}) {
  const tv = createFakeSamsungTv({ host: HOST, mac: MAC, prompt: 'allow' });
  const lan = createFakeSamsungLan([tv]);
  const secrets = memSecrets(seed);
  const samsung = createSamsungBrand({ transport: lan, secrets });
  return { tv, lan, secrets, samsung };
}

describe('createSamsungBrand', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('has the brand fields', () => {
    const { samsung } = rig();
    expect(samsung).toMatchObject({
      kind: 'samsung',
      labelKey: 'addTv.brandSamsung',
      pairing: 'allow',
      probePorts: [8001, 8002],
    });
  });

  it('lists a Samsung TV once through the composite, next to LG', async () => {
    const { lan, secrets, samsung } = rig();
    const lg = createWebosBrand({ transport: lan, secrets });
    const setup = createCompositeTvSetup({ brands: [lg, samsung], transport: lan, probeMs: 100 });
    const found: FoundTv[] = [];
    setup.discover((f) => found.push(f));
    await jest.advanceTimersByTimeAsync(3500);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'samsung', host: HOST, secure: true });
  });

  it('pairs a Samsung FoundTv into a samsung link', async () => {
    const { tv, lan, secrets, samsung } = rig();
    const lg = createWebosBrand({ transport: lan, secrets });
    const setup = createCompositeTvSetup({ brands: [lg, samsung], transport: lan });
    const res = await setup.pair(
      { kind: 'samsung', host: HOST, name: 'Samsung TV', secure: true },
      PROMPTS,
    );
    expect(res.link).toMatchObject({
      kind: 'samsung',
      host: HOST,
      mac: MAC,
      pinSha256: tv.certSha256,
    });
    expect(res.suggestedName).toBe(tv.name);
  });

  it('findAgain returns the new host, and null with no stored token', async () => {
    const { tv, samsung } = rig({ 'samsung:1': '12345678' });
    const link = {
      kind: 'samsung' as const,
      host: HOST,
      mac: MAC,
      tokenRef: 'samsung:1',
      pinSha256: tv.certSha256,
    };
    const dev: Device = { id: 'd', kind: 'tv', name: 'TV', roomId: 'r', order: 0, links: [link] };
    tv.moveTo(NEW_HOST);
    const p = samsung.findAgain(dev, link);
    await jest.advanceTimersByTimeAsync(4000);
    await expect(p).resolves.toBe(NEW_HOST);

    const bare = rig();
    await expect(bare.samsung.findAgain(dev, link)).resolves.toBeNull();
    await expect(
      bare.samsung.findAgain(dev, { kind: 'webos', host: HOST, secure: false, clientKeyRef: 'k' }),
    ).resolves.toBeNull();
  });
});
