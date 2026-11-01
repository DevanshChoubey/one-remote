import { DeviceError, PairError } from '@/core';
import { pairSamsung } from '@/samsung/pair';
import { createFakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv } from '@/samsung/testing/fakeTv';
import type { TvSecretsWithDelete } from '@/tv/transport';

const HOST = '192.168.1.40';
const MAC = 'aa:bb:cc:dd:ee:ff';
const FOUND = { kind: 'samsung', host: HOST, name: 'Samsung TV', secure: true } as const;

function memSecrets(): TvSecretsWithDelete & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
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

function setup(opts: Partial<Parameters<typeof createFakeSamsungTv>[0]> = {}) {
  const tv = createFakeSamsungTv({ host: HOST, mac: MAC, ...opts });
  return { tv, lan: createFakeSamsungLan([tv]), secrets: memSecrets() };
}

async function flush(n = 20): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

describe('pairSamsung', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows Press Allow once after the delay, then stores the token and pin', async () => {
    const { tv, lan, secrets } = setup();
    const onAllow = jest.fn();
    const p = pairSamsung(lan, secrets, FOUND, { onAllow });
    await flush();
    expect(onAllow).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(onAllow).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    expect(onAllow).toHaveBeenCalledTimes(1);
    tv.allow();
    const res = await p;
    expect(res.link).toEqual({
      kind: 'samsung',
      host: HOST,
      mac: MAC,
      tokenRef: expect.stringMatching(/^samsung:/) as string,
      pinSha256: tv.certSha256,
    });
    expect(res.suggestedName).toBe(tv.name);
    expect(secrets.map.get(res.link.tokenRef)).toBe('12345678');
    expect(tv.connections()).toBe(0);
  });

  it('never asks for Allow when the TV allows all', async () => {
    const { lan, secrets } = setup({ prompt: 'allow' });
    const onAllow = jest.fn();
    const p = pairSamsung(lan, secrets, FOUND, { onAllow });
    await flush();
    jest.advanceTimersByTime(1000);
    await p;
    expect(onAllow).not.toHaveBeenCalled();
  });

  it('deny() gives denied', async () => {
    const { tv, lan, secrets } = setup();
    const p = pairSamsung(lan, secrets, FOUND, { onAllow: jest.fn() });
    const assertion = expect(p).rejects.toMatchObject({ code: 'denied' });
    await flush();
    tv.deny();
    await assertion;
    expect(secrets.map.size).toBe(0);
  });

  it('no answer for promptMs gives timeout', async () => {
    const { lan, secrets } = setup();
    const p = pairSamsung(lan, secrets, FOUND, { onAllow: jest.fn() }, { promptMs: 60000 });
    const assertion = expect(p).rejects.toEqual(expect.objectContaining({ code: 'timeout' }));
    await flush();
    jest.advanceTimersByTime(60000);
    await assertion;
  });

  it('an off TV is unreachable and nothing is stored', async () => {
    const { tv, lan, secrets } = setup();
    tv.setPower('off');
    const err = await pairSamsung(lan, secrets, FOUND, { onAllow: jest.fn() }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PairError);
    expect(err).toMatchObject({ code: 'unreachable' });
    expect(secrets.map.size).toBe(0);
  });

  it('a junk info page is unreachable', async () => {
    const { tv, lan, secrets } = setup();
    tv.setInfoBody('<html>');
    await expect(pairSamsung(lan, secrets, FOUND, { onAllow: jest.fn() })).rejects.toMatchObject({
      code: 'unreachable',
    });
  });

  it('rethrows notLocal', async () => {
    const { lan, secrets } = setup();
    lan.request = () => Promise.reject(new DeviceError('notLocal'));
    await expect(pairSamsung(lan, secrets, FOUND, { onAllow: jest.fn() })).rejects.toMatchObject({
      code: 'notLocal',
    });
  });

  it('re-pairing keeps the tokenRef and replaces the pin', async () => {
    const { tv, lan, secrets } = setup({ prompt: 'allow' });
    secrets.map.set('samsung:old', 'stale');
    tv.certSha256 = 'new-cert';
    const p = pairSamsung(
      lan,
      secrets,
      FOUND,
      { onAllow: jest.fn() },
      {
        reuse: {
          kind: 'samsung',
          host: '10.0.0.9',
          tokenRef: 'samsung:old',
          pinSha256: 'old-cert',
        },
      },
    );
    const res = await p;
    expect(res.link.tokenRef).toBe('samsung:old');
    expect(res.link.pinSha256).toBe('new-cert');
    expect(secrets.map.get('samsung:old')).toBe('12345678');
  });

  it('a TV that sends no token stores an empty one and succeeds', async () => {
    const { lan, secrets } = setup({ prompt: 'allow', noToken: true });
    const res = await pairSamsung(lan, secrets, FOUND, { onAllow: jest.fn() });
    expect(secrets.map.get(res.link.tokenRef)).toBe('');
  });

  it('a failing secret store is unreachable', async () => {
    const { lan, secrets } = setup({ prompt: 'allow' });
    secrets.set = () => Promise.reject(new Error('keystore'));
    await expect(pairSamsung(lan, secrets, FOUND, { onAllow: jest.fn() })).rejects.toMatchObject({
      code: 'unreachable',
    });
  });
});
