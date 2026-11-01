import type { PairPrompts, TvLink } from '@/core';
import { PairError } from '@/core/tvSetup';
import { pairTv } from '@/webos/pair';
import { createFakeLan } from '@/webos/testing/fakeLan';
import { createFakeTv } from '@/webos/testing/fakeTv';
import type { TvSecretsWithDelete } from '@/webos/transport';

const HOST = '192.168.1.23';
const MAC = 'aa:bb:cc:00:11:22';

function memorySecrets(): TvSecretsWithDelete & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (ref) => Promise.resolve(map.get(ref) ?? null),
    set: (ref, v) => {
      map.set(ref, v);
      return Promise.resolve();
    },
    delete: (ref) => {
      map.delete(ref);
      return Promise.resolve();
    },
  };
}

const prompts = (onAllow: () => void = jest.fn()): PairPrompts => ({
  onAllow,
  askCode: () => Promise.resolve(null),
});
const reuse = (clientKeyRef: string): TvLink => ({
  kind: 'webos',
  host: HOST,
  secure: false,
  clientKeyRef,
});

const found = {
  kind: 'webos' as const,
  host: HOST,
  name: '[LG] webOS TV OLED55C4',
  secure: false,
  usn: 'uuid:1234',
};

describe('pairTv', () => {
  it('pair allows', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, prompt: 'allow' });
    const lan = createFakeLan({ tvs: [tv] });
    const secrets = memorySecrets();
    const onPrompt = jest.fn();
    const paired = await pairTv(lan, secrets, found, prompts(onPrompt));
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
        kind: 'webos',
        host: HOST,
        name: '[LG] ',
        secure: false,
      },
      prompts(),
    );
    expect(paired.suggestedName).toBe('LG TV');
  });

  it('pair denied', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, prompt: 'deny' });
    const secrets = memorySecrets();
    await expect(
      pairTv(createFakeLan({ tvs: [tv] }), secrets, found, prompts()),
    ).rejects.toMatchObject({ code: 'denied' });
    expect(secrets.map.size).toBe(0);
  });

  it('pair unreachable', async () => {
    const lan = createFakeLan({ tvs: [] });
    const err = await pairTv(lan, memorySecrets(), found, prompts()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PairError);
    expect((err as PairError).code).toBe('unreachable');
    // The reason for each port that failed is kept, so a hardware run can say why.
    expect((err as PairError).message).toMatch(/^unreachable: .*3000.*; .*3001/);
  });

  it('re-pair keeps the ref', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC });
    const secrets = memorySecrets();
    const paired = await pairTv(
      createFakeLan({ tvs: [tv] }),
      secrets,
      found,
      prompts(),
      reuse('webos:abc'),
    );
    expect(paired.link.clientKeyRef).toBe('webos:abc');
    expect(secrets.map.get('webos:abc')).toBeDefined();
  });

  it('uses wss on 3001 for a secure TV, pairing-trusts it and records its certificate', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, secure: true, certSha256: 'ab12' });
    const lan = createFakeLan({ tvs: [tv] });
    const secrets = memorySecrets();
    const paired = await pairTv(lan, secrets, { ...found, secure: true }, prompts());
    expect(paired.link.secure).toBe(true);
    expect(lan.opened[0]).toBe(`wss://${HOST}:3001`);
    expect(lan.tlsOpened[0]).toEqual({ pairing: true });
    const ref = paired.link.clientKeyRef;
    expect(secrets.map.get(`${ref}:cert`)).toBe('ab12');
    expect(secrets.map.get(ref)).toMatch(/^fake-key-/);
  });

  it('stores no certificate for a plain ws TV', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC });
    const secrets = memorySecrets();
    const paired = await pairTv(createFakeLan({ tvs: [tv] }), secrets, found, prompts());
    expect(secrets.map.has(`${paired.link.clientKeyRef}:cert`)).toBe(false);
  });

  it('deletes an old pin when a re-pair lands on plain ws', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC });
    const secrets = memorySecrets();
    secrets.map.set('webos:abc:cert', 'old-pin');
    await pairTv(createFakeLan({ tvs: [tv] }), secrets, found, prompts(), reuse('webos:abc'));
    expect(secrets.map.has('webos:abc:cert')).toBe(false);
    expect(secrets.map.get('webos:abc')).toMatch(/^fake-key-/);
  });

  it('fails unreachable, storing nothing, when the secure socket reports no certificate', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, secure: true });
    const lan = createFakeLan({ tvs: [tv] });
    const open = lan.open.bind(lan);
    lan.open = async (url, ms, tls) => {
      const s = await open(url, ms, tls);
      return { send: s.send, close: s.close, onMessage: s.onMessage, onClose: s.onClose };
    };
    const secrets = memorySecrets();
    const err = await pairTv(lan, secrets, { ...found, secure: true }, prompts()).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PairError);
    expect((err as PairError).code).toBe('unreachable');
    expect(secrets.map.size).toBe(0);
    expect(tv.frames).toEqual([]);
  });

  it('tries wss 3001 when ws 3000 is refused', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC, secure: true });
    const lan = createFakeLan({ tvs: [tv] });
    const paired = await pairTv(lan, memorySecrets(), found, prompts());
    expect(paired.link.secure).toBe(true);
    expect(lan.opened).toEqual([`ws://${HOST}:3000`, `wss://${HOST}:3001`]);
  });

  it('fails with a PairError when the key cannot be kept', async () => {
    const tv = createFakeTv({ host: HOST, mac: MAC });
    const secrets: TvSecretsWithDelete = {
      get: () => Promise.resolve(null),
      set: () => Promise.reject(new Error('keystore')),
      delete: () => Promise.resolve(),
    };
    const err = await pairTv(createFakeLan({ tvs: [tv] }), secrets, found, prompts()).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PairError);
  });

  it('omits the mac when the TV does not report one', async () => {
    const tv = createFakeTv({ host: HOST, mac: 'nope' });
    const paired = await pairTv(createFakeLan({ tvs: [tv] }), memorySecrets(), found, prompts());
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
      pairTv(lan, memorySecrets(), found, prompts(onPrompt)).catch((e: unknown) => (err = e));
      await jest.advanceTimersByTimeAsync(59999);
      expect(err).toBeUndefined();
      expect(onPrompt).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect((err as PairError).code).toBe('timeout');
    });

    it('honours promptMs', async () => {
      const tv = createFakeTv({ host: HOST, mac: MAC, prompt: 'never' });
      let err: unknown;
      pairTv(createFakeLan({ tvs: [tv] }), memorySecrets(), found, prompts(), undefined, {
        promptMs: 1000,
      }).catch((e: unknown) => (err = e));
      await jest.advanceTimersByTimeAsync(1000);
      expect((err as PairError).code).toBe('timeout');
    });
  });
});
