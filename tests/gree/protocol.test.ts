import { defaultAcState } from '@/core';
import type { AcState } from '@/core';
import { GENERIC_KEY, decryptPack, encryptPack } from '@/gree/crypto';
import {
  GreeProtocolError,
  bindPack,
  checkCmdReply,
  cmdPack,
  normaliseMac,
  openMessage,
  packMessage,
  parseBindOk,
  parseScanReply,
  parseStatus,
  scanRequest,
  statusPack,
} from '@/gree/protocol';
import type { Json } from '@/gree/protocol';

const MAC = 'f4911e000001';

function reply(inner: object, key: string, cipher: 'ecb' | 'gcm'): string {
  const s = encryptPack(JSON.stringify(inner), key, cipher);
  return JSON.stringify({ t: 'pack', i: 0, uid: 0, cid: MAC, tcid: '', ...s });
}

describe('scan', () => {
  it('asks with a plain scan', () => {
    expect(scanRequest()).toBe('{"t":"scan"}');
  });

  it('reads an ECB scan reply', () => {
    const text = reply(
      {
        t: 'dev',
        cid: MAC,
        mac: MAC,
        name: '1e8e3f0a',
        brand: 'gree',
        model: 'gree',
        ver: 'V1.1.13',
      },
      GENERIC_KEY.ecb,
      'ecb',
    );
    expect(parseScanReply(text, '192.168.1.40')).toEqual({
      mac: MAC,
      host: '192.168.1.40',
      name: '1e8e3f0a',
      cipher: 'ecb',
      brand: 'gree',
      model: 'gree',
      version: 'V1.1.13',
    });
  });

  it('takes a reply with a tag as GCM', () => {
    const text = reply({ t: 'dev', mac: 'F4:91:1E:00:00:01' }, GENERIC_KEY.gcm, 'gcm');
    expect(parseScanReply(text, '192.168.1.41')).toMatchObject({
      mac: MAC,
      cipher: 'gcm',
      name: '',
    });
  });

  it('ignores anything that is not a unit', () => {
    expect(parseScanReply('hello', '192.168.1.2')).toBeNull();
    expect(parseScanReply('[1]', '192.168.1.2')).toBeNull();
    expect(parseScanReply('{"t":"scan"}', '192.168.1.2')).toBeNull();
    expect(
      parseScanReply(reply({ t: 'dev', mac: 'nope' }, GENERIC_KEY.ecb, 'ecb'), 'h'),
    ).toBeNull();
    expect(parseScanReply(reply({ t: 'other', mac: MAC }, GENERIC_KEY.ecb, 'ecb'), 'h')).toBeNull();
    // Encrypted with a key that is not the generic one.
    expect(
      parseScanReply(reply({ t: 'dev', mac: MAC }, 'xxxxxxxxxxxxxxxx', 'ecb'), 'h'),
    ).toBeNull();
  });
});

describe('envelope', () => {
  it('wraps a pack for the unit, and carries the GCM tag', () => {
    const ecb = JSON.parse(packMessage(bindPack(MAC, 'ecb'), MAC, GENERIC_KEY.ecb, 'ecb', 1));
    expect(ecb).toMatchObject({ cid: 'app', i: 1, t: 'pack', tcid: MAC, uid: 0 });
    expect(ecb.tag).toBeUndefined();
    expect(JSON.parse(decryptPack(ecb, GENERIC_KEY.ecb, 'ecb'))).toEqual({
      mac: MAC,
      t: 'bind',
      uid: 0,
    });
    const gcm = JSON.parse(packMessage(bindPack(MAC, 'gcm'), MAC, GENERIC_KEY.gcm, 'gcm', 1));
    expect(typeof gcm.tag).toBe('string');
    expect(JSON.parse(decryptPack(gcm, GENERIC_KEY.gcm, 'gcm'))).toEqual({
      cid: MAC,
      mac: MAC,
      t: 'bind',
      uid: 0,
    });
  });

  it('refuses replies that are not packs', () => {
    expect(() => openMessage('{"t":"dev"}', GENERIC_KEY.ecb, 'ecb')).toThrow(GreeProtocolError);
    expect(() => openMessage('nope', GENERIC_KEY.ecb, 'ecb')).toThrow(GreeProtocolError);
  });
});

describe('bind', () => {
  it('reads the device key', () => {
    expect(parseBindOk({ t: 'bindok', mac: MAC, key: 'Dk3Lm9Pq2Rs7Tu1V', r: 200 })).toBe(
      'Dk3Lm9Pq2Rs7Tu1V',
    );
  });

  it('refuses a refusal or a bad key', () => {
    expect(() => parseBindOk({ t: 'bindok', key: 'Dk3Lm9Pq2Rs7Tu1V', r: 500 })).toThrow();
    expect(() => parseBindOk({ t: 'bindok', key: 'short', r: 200 })).toThrow();
    expect(() => parseBindOk({ t: 'res', key: 'Dk3Lm9Pq2Rs7Tu1V' })).toThrow();
  });
});

describe('cmd', () => {
  it('sets every field of the absolute state', () => {
    const s: AcState = {
      power: true,
      mode: 'cool',
      setpoint: 24,
      fan: 2,
      swing: true,
      sleep: true,
    };
    expect(cmdPack(s)).toEqual({
      opt: ['Pow', 'Mod', 'TemUn', 'SetTem', 'WdSpd', 'SwUpDn', 'SwhSlp', 'SlpMod'],
      p: [1, 1, 0, 24, 3, 1, 1, 1],
      t: 'cmd',
    });
  });

  it('maps modes and fan speeds, and clamps the setpoint', () => {
    const base = defaultAcState();
    const p = (s: Partial<AcState>): number[] => cmdPack({ ...base, ...s }).p as number[];
    expect(p({ mode: 'auto' })[1]).toBe(0);
    expect(p({ mode: 'dry' })[1]).toBe(2);
    expect(p({ mode: 'fan' })[1]).toBe(3);
    expect(p({ fan: 'auto' })[4]).toBe(0);
    expect(p({ fan: 1 })[4]).toBe(1);
    expect(p({ fan: 3 })[4]).toBe(5);
    expect(p({ setpoint: 40 })[3]).toBe(30);
    expect(p({ setpoint: 10.4 })[3]).toBe(16);
    expect(p({ power: false, swing: false, sleep: false })).toEqual([0, 1, 0, 24, 0, 0, 0, 0]);
  });

  it('checks the reply', () => {
    expect(() => checkCmdReply({ t: 'res', r: 200 })).not.toThrow();
    expect(() => checkCmdReply({ t: 'res', r: 400 })).toThrow(GreeProtocolError);
    expect(() => checkCmdReply({ t: 'dat', r: 200 })).toThrow(GreeProtocolError);
  });
});

describe('status', () => {
  const prev = defaultAcState();
  const dat = (pairs: Record<string, number>): Json => ({
    t: 'dat',
    cols: Object.keys(pairs),
    dat: Object.values(pairs),
  });

  it('asks for the columns the app shows', () => {
    expect(statusPack(MAC)).toEqual({
      cols: ['Pow', 'Mod', 'SetTem', 'TemUn', 'WdSpd', 'SwUpDn', 'SwhSlp', 'TemSen'],
      mac: MAC,
      t: 'status',
    });
  });

  it('reads the state and the room temperature', () => {
    expect(
      parseStatus(
        dat({ Pow: 1, Mod: 2, SetTem: 26, TemUn: 0, WdSpd: 5, SwUpDn: 1, SwhSlp: 1, TemSen: 67 }),
        prev,
      ),
    ).toEqual({
      state: { power: true, mode: 'dry', setpoint: 26, fan: 3, swing: true, sleep: true },
      roomTemp: 27,
    });
  });

  it('maps five speeds to three and swing regions to swinging', () => {
    const fan = (v: number): unknown => parseStatus(dat({ WdSpd: v }), prev).state.fan;
    expect([0, 1, 2, 3, 4, 5].map(fan)).toEqual(['auto', 1, 1, 2, 3, 3]);
    const swing = (v: number): boolean => parseStatus(dat({ SwUpDn: v }), prev).state.swing;
    expect([0, 1, 2, 6, 7, 11].map(swing)).toEqual([false, true, false, false, true, true]);
  });

  it('keeps what it cannot show: heat, Fahrenheit, odd values, missing fields', () => {
    const was: AcState = { ...prev, mode: 'dry', setpoint: 22, fan: 2 };
    const r = parseStatus(dat({ Mod: 4, SetTem: 77, TemUn: 1, WdSpd: 9, TemSen: 0 }), was);
    expect(r).toEqual({ state: was });
    expect(parseStatus(dat({ TemSen: 25 }), prev).roomTemp).toBe(25);
    expect(parseStatus({ t: 'dat', cols: ['Pow', 7], dat: ['x', 1] }, prev).state).toEqual(prev);
  });

  it('refuses something that is not status data', () => {
    expect(() => parseStatus({ t: 'res' }, prev)).toThrow(GreeProtocolError);
    expect(() => parseStatus({ t: 'dat', cols: 'Pow' }, prev)).toThrow(GreeProtocolError);
  });
});

describe('normaliseMac', () => {
  it('accepts any separators and case', () => {
    expect(normaliseMac('F4-91-1E-00-00-01')).toBe(MAC);
    expect(normaliseMac('f4911e')).toBeNull();
  });
});
