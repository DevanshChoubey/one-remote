import { rediscoverSamsung } from '@/samsung/rediscover';
import { createFakeSamsungLan } from '@/samsung/testing/fakeLan';
import { createFakeSamsungTv } from '@/samsung/testing/fakeTv';

const HOST = '192.168.1.40';
const NEW_HOST = '192.168.1.99';
const MAC = 'aa:bb:cc:dd:ee:ff';

const link = (over: object = {}) =>
  ({
    kind: 'samsung',
    host: HOST,
    mac: MAC,
    tokenRef: 'samsung:1',
    pinSha256: `cert-${MAC.replace(/:/g, '')}`,
    ...over,
  }) as const;

async function run<T>(p: Promise<T>): Promise<T> {
  // Let the discovery windows end.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
  }
  return p;
}

describe('rediscoverSamsung', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('finds the TV at its new host', async () => {
    const tv = createFakeSamsungTv({ host: HOST, mac: MAC });
    const lan = createFakeSamsungLan([tv]);
    tv.moveTo(NEW_HOST);
    await expect(run(rediscoverSamsung(lan, link()))).resolves.toBe(NEW_HOST);
    // The check sent no token (it could pop an Allow prompt) and closed its socket.
    expect(lan.opened).toHaveLength(1);
    expect(lan.opened[0]).not.toContain('token=');
    expect(tv.connections()).toBe(0);
  });

  it('never adopts a host with a different MAC', async () => {
    const other = createFakeSamsungTv({ host: NEW_HOST, mac: '11:22:33:44:55:66' });
    const lan = createFakeSamsungLan([other]);
    await expect(run(rediscoverSamsung(lan, link()))).resolves.toBeNull();
    expect(lan.opened).toEqual([]);
  });

  it('rejects a candidate whose certificate is not the pinned one', async () => {
    const tv = createFakeSamsungTv({ host: NEW_HOST, mac: MAC, certSha256: 'changed' });
    const lan = createFakeSamsungLan([tv]);
    await expect(run(rediscoverSamsung(lan, link()))).resolves.toBeNull();
  });

  it('is null at once without a MAC', async () => {
    const lan = createFakeSamsungLan([]);
    await expect(rediscoverSamsung(lan, link({ mac: undefined }))).resolves.toBeNull();
    expect(lan.probes).toEqual([]);
  });

  it('checks at most maxCandidates', async () => {
    const tvs = [1, 2, 3, 4].map((i) =>
      createFakeSamsungTv({
        host: `192.168.1.${String(50 + i)}`,
        mac: `aa:aa:aa:aa:aa:0${String(i)}`,
      }),
    );
    const good = createFakeSamsungTv({ host: '192.168.1.60', mac: MAC });
    const lan = createFakeSamsungLan([...tvs, good]);
    await expect(run(rediscoverSamsung(lan, link(), { maxCandidates: 2 }))).resolves.toBeNull();
  });

  it('gives up when SSDP and the probe hang', async () => {
    const lan = createFakeSamsungLan([]);
    const hung = {
      ...lan,
      ssdpSearch: () => new Promise<void>(() => undefined),
      probe: () => new Promise<void>(() => undefined),
    };
    const p = rediscoverSamsung(hung, link(), { giveUpMs: 20000 });
    jest.advanceTimersByTime(19999);
    let done = false;
    void p.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(p).resolves.toBeNull();
  });
});
