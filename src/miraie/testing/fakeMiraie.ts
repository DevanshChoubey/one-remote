import { HOMES_URL, LOGIN_URL, deviceUrl, statusUrl } from '../protocol';
import { createFakeCloud } from './fakeCloud';
import type { FakeCloud } from './fakeCloud';

export interface FakeAccountDevice {
  deviceId: string;
  name: string;
  space?: string;
  category?: string;
  /** The HTTP status body; default an AC that is on, cool 24. */
  status?: Record<string, unknown>;
}

export interface FakeAccount {
  phone: string;
  password: string;
  userId: string;
  homeId: string;
  devices: FakeAccountDevice[];
  /** The token the next login hands out; logins bump it (`tok1`, `tok2`...). */
  readonly token: string;
  readonly logins: number;
  /** Makes every current token stale: the API answers 401 and the broker refuses it. */
  expireTokens(): void;
}

export const topicOf = (a: Pick<FakeAccount, 'userId' | 'homeId'>, deviceId: string): string =>
  `${a.userId}/${a.homeId}/${deviceId}`;

/** A fake MirAIe service (HTTP API and MQTT broker) holding one account with one home. */
export function createFakeMiraie(
  devices: FakeAccountDevice[] = [{ deviceId: 'dev1', name: 'Bedroom AC', space: 'Bedroom' }],
): { cloud: FakeCloud; account: FakeAccount } {
  const cloud = createFakeCloud();
  let logins = 0;
  let valid = new Set<string>();
  const account: FakeAccount = {
    phone: '+919812345210',
    password: 'test-password',
    userId: 'user1',
    homeId: 'home1',
    devices,
    get token() {
      return `tok${logins}`;
    },
    get logins() {
      return logins;
    },
    expireTokens() {
      valid = new Set();
    },
  };
  const authed = (h?: Record<string, string>): boolean =>
    valid.has((h?.Authorization ?? '').replace(/^Bearer /, ''));

  cloud.http.route('POST', LOGIN_URL, (req) => {
    const b = JSON.parse(req.body ?? '{}') as Record<string, string>;
    if (b.mobile !== account.phone) return { status: 412, body: '{"message":"not registered"}' };
    if (b.password !== account.password) return { status: 401, body: '{"message":"bad"}' };
    logins++;
    valid.add(account.token);
    return {
      status: 200,
      body: JSON.stringify({
        userId: account.userId,
        accessToken: account.token,
        refreshToken: `refresh${logins}`,
        expiresIn: 86400,
      }),
    };
  });
  cloud.http.route('GET', HOMES_URL, (req) => {
    if (!authed(req.headers)) return { status: 401, body: '' };
    return {
      status: 200,
      body: JSON.stringify([
        {
          homeId: account.homeId,
          homeName: 'Home',
          spaces: [
            {
              spaceName: 'Home',
              devices: account.devices.map((d) => ({
                deviceId: d.deviceId,
                deviceName: d.name,
                topic: [topicOf(account, d.deviceId)],
              })),
            },
          ],
        },
      ]),
    };
  });
  for (const d of account.devices) {
    cloud.http.route('GET', deviceUrl(d.deviceId), (req) =>
      authed(req.headers)
        ? {
            status: 200,
            body: JSON.stringify([{ category: d.category ?? 'AC', brand: 'Panasonic' }]),
          }
        : { status: 401, body: '' },
    );
    cloud.http.route('GET', statusUrl(d.deviceId), (req) =>
      authed(req.headers)
        ? {
            status: 200,
            body: JSON.stringify(
              d.status ?? {
                onlineStatus: 'true',
                ps: 'on',
                acmd: 'cool',
                actmp: '24.0',
                acfs: 'auto',
                acvs: 0,
                rmtmp: '27.5',
              },
            ),
          }
        : { status: 401, body: '' },
    );
  }
  cloud.broker.accept = (u, p) => u === account.homeId && p !== undefined && valid.has(p);
  return { cloud, account };
}
