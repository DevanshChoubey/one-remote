import { PairError } from '@/core/tvSetup';
import { pairTv } from '@/webos/pair';
import { createFakeLan } from '@/webos/testing/fakeLan';
import { createFakeTv } from '@/webos/testing/fakeTv';
import type { TvSecrets } from '@/webos/transport';

const HOST = '192.168.1.23';
const MAC = 'aa:bb:cc:00:11:22';

function memorySecrets(): TvSecrets & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (ref) => Promise.resolve(map.get(ref) ?? null),
    set: (ref, v) => {
      map.set(ref, v);
      return Promise.resolve();
    },
  };
}

const found = { host: HOST, name: '[LG] webOS TV OLED55C4', secure: false, usn: 'uuid:1234' };

describe('pairTv', () => {
  it('pair allows', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, prompt: 'allow' });
    const lan = createFakeLan({ tvs: [tv] });
    const secrets = memorySecrets();
    const onPrompt = jest.fn();
    const paired = await pairTv(lan, secrets, found, onPrompt);
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(paired.link).toEqual({
      kind: 'webos',
      host: HOST,
      mac: MAC,
      secure: false,
      clientKeyRef: expect.stringMatching(/^webos:.+/),
    });
    expect(paired.suggestedName).toBe('webOS TV OLED55C4');
    const ref = paired.link.clientKeyRef;
    expect(secrets.map.get(ref)).toMatch(/^fake-key-/);
    expect(secrets.map.get(`${ref}:usn`)).toBe('uuid:1234');
  });

  it('suggests LG TV when the name is empty', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC });
    const paired = await pairTv(
      createFakeLan({ tvs: [tv] }),
      memorySecrets(),
      {
        host: HOST,
        name: '[LG] ',
        secure: false,
      },
      jest.fn(),
    );
    expect(paired.suggestedName).toBe('LG TV');
  });

  it('pair denied', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, prompt: 'deny' });
    const secrets = memorySecrets();
    await expect(
      pairTv(createFakeLan({ tvs: [tv] }), secrets, found, jest.fn()),
    ).rejects.toMatchObject({ code: 'denied' });
    expect(secrets.map.size).toBe(0);
  });

  it('pair unreachable', async () => {
    const lan = createFakeLan({ tvs: [] });
    const err = await pairTv(lan, memorySecrets(), found, jest.fn()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PairError);
    expect((err as PairError).code).toBe('unreachable');
  });

  it('re-pair keeps the ref', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC });
    const secrets = memorySecrets();
    const paired = await pairTv(createFakeLan({ tvs: [tv] }), secrets, found, jest.fn(), {
      clientKeyRef: 'webos:abc',
    });
    expect(paired.link.clientKeyRef).toBe('webos:abc');
    expect(secrets.map.get('webos:abc')).toBeDefined();
  });

  it('uses wss on 3001 for a secure TV', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, secure: true });
    const lan = createFakeLan({ tvs: [tv] });
    const paired = await pairTv(lan, memorySecrets(), { ...found, secure: true }, jest.fn());
    expect(paired.link.secure).toBe(true);
    expect(lan.opened[0]).toBe(`wss://${HOST}:3001`);
  });

  it('omits the mac when the TV does not report one', async () => {
    const tv = createFakeTv({ host: HOST, mac: 'nope' });
    const paired = await pairTv(createFakeLan({ tvs: [tv] }), memorySecrets(), found, jest.fn());
    expect('mac' in paired.link).toBe(false);
  });

  describe('timeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('pair times out', async () => {
      const tv = createFakeTv({ host: HOST, mac: MAC, prompt: 'never' });
      const lan = createFakeLan({ tvs: [tv] });
      let err: unknown;
      const onPrompt = jest.fn();
      pairTv(lan, memorySecrets(), found, onPrompt).catch((e: unknown) => (err = e));
      await jest.advanceTimersByTimeAsync(59999);
      expect(err).toBeUndefined();
      expect(onPrompt).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect((err as PairError).code).toBe('timeout');
    });

    it('honours promptMs', async () => {
      const tv = createFakeTv({ host: HOST, mac: MAC, prompt: 'never' });
      let err: unknown;
      pairTv(createFakeLan({ tvs: [tv] }), memorySecrets(), found, jest.fn(), {
        promptMs: 1000,
      }).catch((e: unknown) => (err = e));
      await jest.advanceTimersByTimeAsync(1000);
      expect((err as PairError).code).toBe('timeout');
    });
  });
});
