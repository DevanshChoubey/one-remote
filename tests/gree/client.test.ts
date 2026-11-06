import { DeviceError, defaultAcState } from '@/core';
import { createGreeClient } from '@/gree/client';
import { FakeGreeUnit, createFakeGreeLan } from '@/gree/testing/fakeGree';

const ECB_MAC = 'f4911e000001';
const GCM_MAC = 'f4911e000002';

function setup(): {
  ecb: FakeGreeUnit;
  gcm: FakeGreeUnit;
  lan: ReturnType<typeof createFakeGreeLan>;
} {
  const ecb = new FakeGreeUnit({ mac: ECB_MAC, host: '192.168.1.40', name: 'Bedroom' });
  const gcm = new FakeGreeUnit({
    mac: GCM_MAC,
    host: '192.168.1.41',
    cipher: 'gcm',
    key: 'Gc7Mk2Np5Qr8St0U',
  });
  return { ecb, gcm, lan: createFakeGreeLan([ecb, gcm]) };
}

describe('Gree client against fake units', () => {
  it('scans both firmware generations', async () => {
    const { lan } = setup();
    const found = await createGreeClient({ udp: lan }).scan(500);
    expect(found).toEqual([
      expect.objectContaining({
        mac: ECB_MAC,
        host: '192.168.1.40',
        cipher: 'ecb',
        name: 'Bedroom',
      }),
      expect.objectContaining({ mac: GCM_MAC, host: '192.168.1.41', cipher: 'gcm' }),
    ]);
  });

  it('keeps one entry per MAC', async () => {
    const a = new FakeGreeUnit({ mac: ECB_MAC, host: '192.168.1.40' });
    const b = new FakeGreeUnit({ mac: ECB_MAC, host: '192.168.1.50' });
    const found = await createGreeClient({ udp: createFakeGreeLan([a, b]) }).scan(500);
    expect(found).toHaveLength(1);
  });

  it('binds, reads and sets an ECB unit', async () => {
    const { ecb, lan } = setup();
    const client = createGreeClient({ udp: lan });
    const bound = await client.bind({ mac: ECB_MAC, host: ecb.host, cipher: 'ecb' });
    expect(bound).toEqual({ key: ecb.key, cipher: 'ecb' });
    const target = { mac: ECB_MAC, host: ecb.host, ...bound };
    const on = {
      power: true,
      mode: 'cool' as const,
      setpoint: 22,
      fan: 3 as const,
      swing: true,
      sleep: false,
    };
    await client.set(target, on);
    expect(ecb.params).toMatchObject({ Pow: 1, Mod: 1, SetTem: 22, WdSpd: 5, SwUpDn: 1 });
    await expect(client.status(target, defaultAcState())).resolves.toEqual({
      state: on,
      roomTemp: 26,
    });
  });

  it('binds a GCM unit and falls back to the other cipher when the scan guessed wrong', async () => {
    const { gcm, lan } = setup();
    const client = createGreeClient({ udp: lan });
    await expect(client.bind({ mac: GCM_MAC, host: gcm.host, cipher: 'ecb' })).resolves.toEqual({
      key: 'Gc7Mk2Np5Qr8St0U',
      cipher: 'gcm',
    });
    const target = { mac: GCM_MAC, host: gcm.host, key: gcm.key, cipher: 'gcm' as const };
    await client.set(target, { ...defaultAcState(), power: true, mode: 'fan' });
    expect(gcm.params).toMatchObject({ Pow: 1, Mod: 3 });
  });

  it('maps failures to device errors', async () => {
    const { ecb, lan } = setup();
    const client = createGreeClient({ udp: lan });
    const target = { mac: ECB_MAC, host: ecb.host, key: ecb.key, cipher: 'ecb' as const };
    ecb.refuseWith = 400;
    await expect(client.set(target, defaultAcState())).rejects.toMatchObject({ code: 'notSent' });
    ecb.up = false;
    await expect(client.status(target, defaultAcState())).rejects.toMatchObject({
      code: 'timeout',
    });
    await expect(client.bind({ ...target })).rejects.toMatchObject({ code: 'timeout' });
    lan.onWifiResult = false;
    await expect(client.scan(100)).rejects.toBeInstanceOf(DeviceError);
    await expect(client.bind({ ...target })).rejects.toMatchObject({ code: 'notSent' });
  });

  it('says notPaired when a reply cannot be opened with the saved key', async () => {
    const lan = {
      onWifi: () => Promise.resolve(true),
      scan: () => Promise.resolve(),
      request: () =>
        Promise.resolve('{"t":"pack","pack":"VT6PQOWv+8FeevjTXFZdyQ==","cid":"f4911e000001"}'),
    };
    const client = createGreeClient({ udp: lan });
    const target = {
      mac: ECB_MAC,
      host: '192.168.1.40',
      key: 'Dk3Lm9Pq2Rs7Tu1V',
      cipher: 'ecb' as const,
    };
    await expect(client.status(target, defaultAcState())).rejects.toMatchObject({
      code: 'notPaired',
    });
    // The generic key opens it, but it is a scan reply, not a key.
    await expect(client.bind({ ...target })).rejects.toMatchObject({ code: 'notPaired' });
  });
});
