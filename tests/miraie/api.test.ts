import { MiraieError } from '@/core';
import { TokenRejected, createMiraieApi } from '@/miraie/api';
import { CloudNetError } from '@/miraie/net';
import { createFakeMiraie, topicOf } from '@/miraie/testing/fakeMiraie';

describe('miraie api', () => {
  it('logs in with the phone number and password and gets a token', async () => {
    const { cloud, account } = createFakeMiraie();
    const api = createMiraieApi({ net: cloud.net, now: () => 0, scopeDigits: () => '42' });
    const tokens = await api.login(account.phone, account.password);
    expect(tokens).toEqual({
      userId: 'user1',
      accessToken: 'tok1',
      refreshToken: 'refresh1',
      expiresAt: 86_400_000,
    });
    const req = cloud.http.requests[0];
    expect(req?.url).toBe('https://auth.miraie.in/simplifi/v1/userManagement/login');
    expect(JSON.parse(req?.body ?? '')).toMatchObject({ mobile: account.phone, scope: 'an42' });
  });

  it('maps a wrong password, an unknown number and no network', async () => {
    const { cloud, account } = createFakeMiraie();
    const api = createMiraieApi({ net: cloud.net });
    await expect(api.login(account.phone, 'wrong')).rejects.toMatchObject({ code: 'badLogin' });
    await expect(api.login('+919000000000', 'x')).rejects.toMatchObject({ code: 'notRegistered' });
    cloud.http.failWith = new CloudNetError('failed');
    await expect(api.login(account.phone, account.password)).rejects.toMatchObject({
      code: 'offline',
    });
    cloud.http.failWith = new CloudNetError('off');
    await expect(api.login(account.phone, account.password)).rejects.toMatchObject({ code: 'off' });
  });

  it('lists only the ACs of the account, keeping one whose details failed', async () => {
    const { cloud, account } = createFakeMiraie([
      { deviceId: 'ac1', name: 'Bedroom AC' },
      { deviceId: 'fan1', name: 'Ceiling fan', category: 'fan' },
      { deviceId: 'ac2', name: 'Hall AC' },
    ]);
    const api = createMiraieApi({ net: cloud.net });
    const { accessToken } = await api.login(account.phone, account.password);
    cloud.http.route(
      'GET',
      'https://app.miraie.in/simplifi/v1/deviceManagement/devices/ac2',
      () => ({
        status: 500,
        body: '',
      }),
    );
    const acs = await api.listAcs(accessToken);
    expect(acs.map((a) => a.deviceId)).toEqual(['ac1', 'ac2']);
    expect(acs[0]).toEqual({
      deviceId: 'ac1',
      homeId: 'home1',
      topic: topicOf(account, 'ac1'),
      name: 'Bedroom AC',
      space: 'Home',
    });
    expect(cloud.http.requests.at(-1)?.headers?.Authorization).toBe(`Bearer ${accessToken}`);
  });

  it('says when the token is refused, and when the server fails', async () => {
    const { cloud } = createFakeMiraie();
    const api = createMiraieApi({ net: cloud.net });
    await expect(api.listAcs('stale')).rejects.toBeInstanceOf(TokenRejected);
    await expect(api.status('stale', 'dev1')).rejects.toBeInstanceOf(TokenRejected);
    cloud.http.route('GET', 'https://app.miraie.in/simplifi/v1/homeManagement/homes', () => ({
      status: 503,
      body: '',
    }));
    await expect(api.listAcs('x')).rejects.toEqual(expect.any(MiraieError));
  });
});
