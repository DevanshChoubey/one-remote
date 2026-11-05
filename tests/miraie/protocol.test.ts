import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import {
  applyStatus,
  controlMessages,
  loginBody,
  parseCategory,
  parseConnection,
  parseHomes,
  parseLogin,
} from '@/miraie/protocol';

const on: AcState = {
  power: true,
  mode: 'cool',
  setpoint: 24,
  fan: 'auto',
  swing: true,
  sleep: false,
};
const parsed = (msgs: string[]) => msgs.map((m) => JSON.parse(m) as Record<string, unknown>);

describe('miraie protocol', () => {
  it('builds the login body with the public client id and a mobile number', () => {
    expect(JSON.parse(loginBody('+919812345210', 'pw', '123'))).toEqual({
      clientId: 'PBcMcfG19njNCL8AOgvRzIC8AjQa',
      mobile: '+919812345210',
      password: 'pw',
      scope: 'an123',
    });
  });

  it('reads the login answer, and refuses one without a token', () => {
    expect(
      parseLogin('{"userId":"u","accessToken":"a","refreshToken":"r","expiresIn":60}', 1000),
    ).toEqual({ userId: 'u', accessToken: 'a', refreshToken: 'r', expiresAt: 61000 });
    expect(parseLogin('{"userId":"u"}', 0)).toBeNull();
    expect(parseLogin('nope', 0)).toBeNull();
  });

  it('lists every device of every home with its topic root', () => {
    const body = JSON.stringify([
      {
        homeId: 'h1',
        spaces: [
          {
            spaceName: 'Bedroom',
            devices: [
              { deviceId: 'd1', deviceName: ' Bedroom AC ', topic: ['u/h1/d1'] },
              { deviceId: 'd2', topic: 'u/h1/d2' },
              { deviceId: 'd3', topic: [] },
              { deviceId: 'd4', topic: ['u/h1/#'] },
            ],
          },
        ],
      },
      { homeId: 'h2', spaces: 'bad' },
      'junk',
    ]);
    expect(parseHomes(body)).toEqual([
      { deviceId: 'd1', homeId: 'h1', topic: 'u/h1/d1', name: 'Bedroom AC', space: 'Bedroom' },
      { deviceId: 'd2', homeId: 'h1', topic: 'u/h1/d2', name: 'd2', space: 'Bedroom' },
    ]);
    expect(parseHomes('{')).toEqual([]);
  });

  it('reads the device category', () => {
    expect(parseCategory('[{"category":"AC"}]')).toBe('ac');
    expect(parseCategory('{"category":"fan"}')).toBe('fan');
    expect(parseCategory('[]')).toBeNull();
  });

  describe('control messages', () => {
    it('sends everything, power first then the mode, when the last state is unknown', () => {
      expect(parsed(controlMessages(on, null))).toEqual([
        { ki: 1, cnt: 'an', sid: '1', ps: 'on' },
        { ki: 1, cnt: 'an', sid: '1', acmd: 'cool' },
        { ki: 1, cnt: 'an', sid: '1', actmp: '24.0' },
        { ki: 1, cnt: 'an', sid: '1', acfs: 'auto' },
        { ki: 1, cnt: 'an', sid: '1', acvs: 0 },
      ]);
    });

    it('sends only what changed', () => {
      const next: AcState = { ...on, setpoint: 22, fan: 3, swing: false };
      expect(parsed(controlMessages(next, on))).toEqual([
        { ki: 1, cnt: 'an', sid: '1', actmp: '22.0' },
        { ki: 1, cnt: 'an', sid: '1', acfs: 'high' },
        { ki: 1, cnt: 'an', sid: '1', acvs: 3 },
      ]);
      expect(controlMessages(on, on)).toEqual([]);
    });

    it('turns off with one message, and sends nothing for off when already off', () => {
      expect(parsed(controlMessages({ ...on, power: false }, on))).toEqual([
        { ki: 1, cnt: 'an', sid: '1', ps: 'off' },
      ]);
      const off = { ...on, power: false };
      expect(controlMessages(off, off)).toEqual([]);
      expect(parsed(controlMessages(off, null))).toEqual([
        { ki: 1, cnt: 'an', sid: '1', ps: 'off' },
      ]);
    });

    it('turning on always repeats the mode', () => {
      const msgs = parsed(controlMessages(on, { ...on, power: false }));
      expect(msgs.map((m) => Object.keys(m).pop())).toEqual(['ps', 'acmd']);
    });

    it('clamps and rounds the set point; maps fan speeds', () => {
      expect(parsed(controlMessages({ ...on, setpoint: 40 }, on))[0]).toMatchObject({
        actmp: '30.0',
      });
      expect(parsed(controlMessages({ ...on, setpoint: 21.6 }, on))[0]).toMatchObject({
        actmp: '22.0',
      });
      for (const [fan, word] of [
        [1, 'low'],
        [2, 'medium'],
        [3, 'high'],
      ] as const) {
        expect(parsed(controlMessages({ ...on, fan }, on))[0]).toMatchObject({ acfs: word });
      }
    });
  });

  describe('status', () => {
    it('reads a full status', () => {
      const s = applyStatus(
        '{"ps":"on","acmd":"dry","actmp":"26.0","acfs":"medium","acvs":"3","rmtmp":"28.5","onlineStatus":"true"}',
        defaultAcState(),
      );
      expect(s).toEqual({
        state: { power: true, mode: 'dry', setpoint: 26, fan: 2, swing: false, sleep: false },
        roomTemp: 28.5,
        online: true,
      });
    });

    it('merges a partial status over the last state and ignores what it does not understand', () => {
      const s = applyStatus('{"actmp":"20.0","acmd":"heat","acfs":"turbo","ps":"ON"}', on);
      expect(s?.state).toEqual({ ...on, setpoint: 20 });
      expect(applyStatus('{"acvs":0}', { ...on, swing: false })?.state.swing).toBe(true);
      expect(applyStatus('{"acfs":"quiet"}', on)?.state.fan).toBe(1);
      expect(applyStatus('[1]', on)).toBeNull();
      expect(applyStatus('not json', on)).toBeNull();
    });

    it('leaves out a room temperature that is not plausible (packed firmware values)', () => {
      expect(applyStatus('{"rmtmp":"2805"}', on)?.roomTemp).toBeUndefined();
      expect(applyStatus('{"rmtmp":"0"}', on)?.roomTemp).toBeUndefined();
    });

    it('reads a connection status in the shapes it might come in', () => {
      expect(parseConnection('{"onlineStatus":"false"}')).toBe(false);
      expect(parseConnection('{"online":true}')).toBe(true);
      expect(parseConnection('{"status":"offline"}')).toBe(false);
      expect(parseConnection('online')).toBe(true);
      expect(parseConnection('{"something":1}')).toBeUndefined();
    });
  });
});
