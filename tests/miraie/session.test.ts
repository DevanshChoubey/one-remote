import { MiraieError } from '@/core';
import { createMiraieApi } from '@/miraie/api';
import { CloudNetError } from '@/miraie/net';
import type { CloudNet } from '@/miraie/net';
import { MIRAIE_SECRET_REF, createMiraieSession } from '@/miraie/session';
import type { MiraieSession } from '@/miraie/session';
import { createFakeMiraie } from '@/miraie/testing/fakeMiraie';
import { createMemorySecretStore } from '@/store/secrets';

jest.mock('expo-secure-store', () => ({}));

const live: MiraieSession[] = [];
afterEach(async () => {
  await Promise.all(live.splice(0).map((s) => s.disconnect()));
});

function setup(o: { optIn?: boolean; saved?: string; now?: () => number } = {}) {
  const fake = createFakeMiraie();
  const secrets = createMemorySecretStore();
  if (o.saved) void secrets.set(MIRAIE_SECRET_REF, o.saved);
  let optIn = o.optIn ?? false;
  // Gated the way the app gates the real transport: nothing leaves while netAllowed() is false.
  const net: CloudNet = {
    request: (r) =>
      session.netAllowed() ? fake.cloud.net.request(r) : Promise.reject(new CloudNetError('off')),
    openTls: (h, p, t) =>
      session.netAllowed()
        ? fake.cloud.net.openTls(h, p, t)
        : Promise.reject(new CloudNetError('off')),
  };
  const session: MiraieSession = createMiraieSession({
    api: createMiraieApi({ net, ...(o.now ? { now: o.now } : {}) }),
    net,
    secrets,
    loadOptIn: () => Promise.resolve(optIn),
    saveOptIn: (v) => {
      optIn = v;
      return Promise.resolve();
    },
    ...(o.now ? { now: o.now } : {}),
    clientId: () => 'oneremote-test',
    connectTimeoutMs: 1000,
  });
  live.push(session);
  return { ...fake, secrets, session, optIn: () => optIn };
}

describe('miraie session', () => {
  it('starts off, with nothing saved and the network closed', async () => {
    const { session } = setup();
    await session.ready;
    expect(session.status()).toEqual({ enabled: false, needsSignIn: false });
    expect(session.available()).toBe(false);
    expect(session.netAllowed()).toBe(false);
    await expect(session.listAcs()).rejects.toMatchObject({ code: 'off' });
  });

  it('signs in, saves the sign-in only in secure storage and turns on', async () => {
    const { session, account, secrets, optIn } = setup();
    const cb = jest.fn();
    session.subscribe(cb);
    await session.signIn('98123 45210', account.password);
    expect(session.status()).toEqual({
      enabled: true,
      account: '+91 98•••••210',
      needsSignIn: false,
    });
    expect(session.available()).toBe(true);
    expect(optIn()).toBe(true);
    expect(JSON.parse((await secrets.get(MIRAIE_SECRET_REF)) ?? '')).toMatchObject({
      phone: '+919812345210',
      accessToken: 'tok1',
    });
    expect(cb).toHaveBeenCalled();
    expect((await session.listAcs()).map((a) => a.deviceId)).toEqual(['dev1']);
  });

  it('checks the number on the phone and words a refused sign-in', async () => {
    const { session, cloud, account } = setup();
    await expect(session.signIn('12345', 'x')).rejects.toMatchObject({ code: 'badPhone' });
    expect(cloud.http.requests).toHaveLength(0);
    await expect(session.signIn(account.phone, 'wrong')).rejects.toMatchObject({
      code: 'badLogin',
    });
    expect(session.status().enabled).toBe(false);
    expect(session.netAllowed()).toBe(false);
  });

  it('disconnect closes the broker and deletes the saved sign-in', async () => {
    const { session, account, secrets, cloud, optIn } = setup();
    await session.signIn(account.phone, account.password);
    await session.connection(account.homeId);
    expect(cloud.broker.openSessions).toBe(1);
    await session.disconnect();
    expect(await secrets.get(MIRAIE_SECRET_REF)).toBeNull();
    expect(optIn()).toBe(false);
    expect(session.status()).toEqual({ enabled: false, needsSignIn: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(cloud.broker.openSessions).toBe(0);
    await expect(session.connection(account.homeId)).rejects.toMatchObject({ code: 'off' });
  });

  it('restores a saved sign-in at start', async () => {
    const saved = JSON.stringify({
      phone: '+919812345210',
      password: 'test-password',
      userId: 'user1',
      accessToken: 'old',
    });
    const { session } = setup({ optIn: true, saved });
    expect(session.available()).toBe(false);
    await session.ready;
    expect(session.available()).toBe(true);
    // The saved token is stale on the fake; the session signs in again once and carries on.
    expect((await session.listAcs()).length).toBe(1);
  });

  it('asks to sign in again when on but nothing is saved', async () => {
    const { session } = setup({ optIn: true });
    await session.ready;
    expect(session.status()).toEqual({ enabled: true, needsSignIn: true });
    await expect(session.listAcs()).rejects.toMatchObject({ code: 'signedOut' });
  });

  it('signs in again before the token expires', async () => {
    let t = 0;
    const { session, account } = setup({ now: () => t });
    await session.signIn(account.phone, account.password);
    expect(account.logins).toBe(1);
    t = 86_400_000;
    await session.listAcs();
    expect(account.logins).toBe(2);
  });

  it('signs in again when the broker refuses the token', async () => {
    const { session, account, cloud } = setup();
    await session.signIn(account.phone, account.password);
    account.expireTokens();
    const conn = await session.connection(account.homeId);
    expect(conn.open).toBe(true);
    expect(account.logins).toBe(2);
    expect(cloud.broker.connects.map((c) => c.password)).toEqual(['tok1', 'tok2']);
  });

  it('needs the user when the saved password stops working', async () => {
    const { session, account, secrets } = setup();
    await session.signIn(account.phone, account.password);
    account.expireTokens();
    account.password = 'changed';
    await expect(session.listAcs()).rejects.toMatchObject({ code: 'signedOut' });
    expect(session.status()).toMatchObject({ enabled: true, needsSignIn: true });
    expect(session.available()).toBe(false);
    expect(await secrets.get(MIRAIE_SECRET_REF)).toBeNull();
  });

  it('shares one broker session per home', async () => {
    const { session, account, cloud } = setup();
    await session.signIn(account.phone, account.password);
    const [a, b] = await Promise.all([
      session.connection(account.homeId),
      session.connection(account.homeId),
    ]);
    expect(a).toBe(b);
    expect(cloud.tlsOpens).toHaveLength(1);
  });

  it('reports an unreachable broker as offline', async () => {
    const { session, account, cloud } = setup();
    await session.signIn(account.phone, account.password);
    cloud.broker.silent = true;
    await expect(session.connection(account.homeId)).rejects.toEqual(expect.any(MiraieError));
    await expect(session.connection(account.homeId)).rejects.toMatchObject({ code: 'offline' });
  });

  it('opens the gated network for the sign-in itself, and only then while off', async () => {
    const { session, account, cloud } = setup();
    await session.signIn(account.phone, account.password);
    expect(cloud.http.requests).toHaveLength(1);
    await session.disconnect();
    await expect(session.listAcs()).rejects.toMatchObject({ code: 'off' });
    expect(cloud.http.requests).toHaveLength(1);
  });
});
