import { DeviceError } from '@/core';
import type { TvHttpRequest } from '@/tv/transport';
import { keyFrame, parseEvent, textFrame } from '@/samsung/frames';
import { fetchInfo, parseInfo } from '@/samsung/info';
import { KEY_NAME, PLAY_PAUSE_CYCLE } from '@/samsung/keys';
import { APP_NAME, INFO_PORT, WSS_PORT, infoUrl, socketUrl } from '@/samsung/url';

const HOST = '192.168.1.40';

function infoBody(device: Record<string, unknown>): string {
  return JSON.stringify({ id: 'uuid:x', name: 'TV', type: 'Samsung SmartTV', device });
}

const FULL = infoBody({
  name: 'Living Room TV',
  modelName: 'UA55AU7700',
  wifiMac: 'AA:BB:CC:DD:EE:FF',
  PowerState: 'on',
  type: 'Samsung SmartTV',
});

describe('KEY_NAME', () => {
  it('maps exactly the 12 keys', () => {
    expect(KEY_NAME).toEqual({
      up: 'KEY_UP',
      down: 'KEY_DOWN',
      left: 'KEY_LEFT',
      right: 'KEY_RIGHT',
      ok: 'KEY_ENTER',
      back: 'KEY_RETURN',
      home: 'KEY_HOME',
      mute: 'KEY_MUTE',
      volumeUp: 'KEY_VOLUP',
      volumeDown: 'KEY_VOLDOWN',
      input: 'KEY_SOURCE',
      power: 'KEY_POWER',
    });
    expect(PLAY_PAUSE_CYCLE).toEqual(['KEY_PAUSE', 'KEY_PLAY']);
  });
});

describe('frames', () => {
  it('builds a key frame', () => {
    const f = JSON.parse(keyFrame('KEY_HOME')) as {
      method: string;
      params: Record<string, string>;
    };
    expect(f.method).toBe('ms.remote.control');
    expect(f.params).toEqual({
      Cmd: 'Click',
      DataOfCmd: 'KEY_HOME',
      Option: 'false',
      TypeOfRemote: 'SendRemoteKey',
    });
  });

  it('builds a text frame with base64 UTF-8', () => {
    const f = JSON.parse(textFrame('hi')) as { method: string; params: Record<string, string> };
    expect(f.method).toBe('ms.remote.control');
    expect(f.params).toEqual({
      Cmd: 'aGk=',
      DataOfCmd: 'base64',
      Option: 'true',
      TypeOfRemote: 'SendInputString',
    });
  });

  it('handles empty and non-ASCII text', () => {
    const empty = JSON.parse(textFrame('')) as { params: { Cmd: string } };
    expect(empty.params.Cmd).toBe('');
    const s = 'नमस्ते 🙂';
    const f = JSON.parse(textFrame(s)) as { params: { Cmd: string } };
    expect(Buffer.from(f.params.Cmd, 'base64').toString('utf8')).toBe(s);
  });

  it('parses TV events', () => {
    expect(parseEvent('{"event":"ms.channel.connect","data":{"token":"123"}}')).toEqual({
      event: 'ms.channel.connect',
      token: '123',
    });
    expect(parseEvent('{"event":"ms.channel.connect","data":{"clients":[]}}')).toEqual({
      event: 'ms.channel.connect',
      token: '',
    });
    expect(parseEvent('{"event":"ms.channel.unauthorized"}')).toEqual({
      event: 'ms.channel.unauthorized',
    });
    expect(parseEvent('{"event":"ms.channel.timeOut"}')).toEqual({ event: 'ms.channel.timeout' });
    expect(parseEvent('{"event":"ms.channel.timeout"}')).toEqual({ event: 'ms.channel.timeout' });
    expect(parseEvent('{"event":"ms.error","data":{"message":"unauthorized"}}')).toEqual({
      event: 'ms.error',
      message: 'unauthorized',
    });
    expect(parseEvent('{"event":"ms.channel.clientConnect"}')).toEqual({ event: 'other' });
    expect(parseEvent('{')).toBeNull();
    expect(parseEvent('[]')).toBeNull();
    expect(parseEvent('{"x":1}')).toBeNull();
  });
});

describe('urls', () => {
  it('builds the socket URL', () => {
    expect(INFO_PORT).toBe(8001);
    expect(WSS_PORT).toBe(8002);
    expect(APP_NAME).toBe('One Remote');
    expect(socketUrl(HOST, '12345678')).toBe(
      'wss://192.168.1.40:8002/api/v2/channels/samsung.remote.control?name=T25lIFJlbW90ZQ%3D%3D&token=12345678',
    );
    expect(socketUrl(HOST, '')).toBe(
      'wss://192.168.1.40:8002/api/v2/channels/samsung.remote.control?name=T25lIFJlbW90ZQ%3D%3D',
    );
    expect(infoUrl(HOST)).toBe('http://192.168.1.40:8001/api/v2/');
  });
});

describe('parseInfo', () => {
  it('reads a full info page', () => {
    expect(parseInfo(FULL)).toEqual({
      name: 'Living Room TV',
      model: 'UA55AU7700',
      mac: 'aa:bb:cc:dd:ee:ff',
      power: 'on',
    });
  });

  it('reads standby and a missing PowerState', () => {
    expect(parseInfo(infoBody({ modelName: 'X', PowerState: 'standby' }))?.power).toBe('standby');
    const old = parseInfo(infoBody({ modelName: 'X' }));
    expect(old?.power).toBe('on');
    expect(old?.name).toBe('Samsung TV');
    expect(old?.mac).toBeUndefined();
  });

  it('drops a MAC that is not one', () => {
    expect(parseInfo(infoBody({ modelName: 'X', wifiMac: 'nope' }))?.mac).toBeUndefined();
  });

  it('accepts a type starting with Samsung', () => {
    expect(parseInfo(infoBody({ type: 'Samsung SmartTV' }))).not.toBeNull();
  });

  it('rejects anything that is not a Samsung info page', () => {
    expect(parseInfo('{"device":{}}')).toBeNull();
    expect(parseInfo('<html><body>Router login</body></html>')).toBeNull();
    expect(parseInfo('{"id":"x"}')).toBeNull();
    expect(parseInfo('{"device":{"type":"Chromecast"}}')).toBeNull();
    expect(parseInfo('null')).toBeNull();
  });
});

describe('fetchInfo', () => {
  it('requests the info page and parses it', async () => {
    const seen: TvHttpRequest[] = [];
    const request = (req: TvHttpRequest) => {
      seen.push(req);
      return Promise.resolve({ status: 200, headers: {}, body: FULL });
    };
    await expect(fetchInfo({ request }, HOST)).resolves.toMatchObject({ name: 'Living Room TV' });
    expect(seen[0]).toMatchObject({ method: 'GET', url: infoUrl(HOST), timeoutMs: 1500 });
  });

  it('throws notSent for a non-200 or a junk body', async () => {
    const r404 = () => Promise.resolve({ status: 404, headers: {}, body: FULL });
    await expect(fetchInfo({ request: r404 }, HOST)).rejects.toMatchObject({ code: 'notSent' });
    const junk = () => Promise.resolve({ status: 200, headers: {}, body: '<html>' });
    await expect(fetchInfo({ request: junk }, HOST)).rejects.toMatchObject({ code: 'notSent' });
  });

  it('passes transport errors through', async () => {
    const err = new DeviceError('notLocal', 'no');
    const request = () => Promise.reject(err);
    await expect(fetchInfo({ request }, HOST)).rejects.toBe(err);
  });
});
