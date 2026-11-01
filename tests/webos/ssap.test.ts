import {
  parseInputs,
  buttonFrame,
  decodeSsap,
  encodeSsap,
  isPoweredOn,
  KEY_BUTTON,
  parseMac,
  parseVolume,
  URI,
} from '@/webos/ssap';

describe('decodeSsap', () => {
  it('decodes a registered message', () => {
    expect(decodeSsap('{"type":"registered","id":"r0","payload":{"client-key":"k"}}')).toEqual({
      type: 'registered',
      id: 'r0',
      payload: { 'client-key': 'k' },
    });
  });

  it('decodes response and error messages', () => {
    expect(decodeSsap('{"type":"response","id":"a","payload":{"returnValue":true}}')).toEqual({
      type: 'response',
      id: 'a',
      payload: { returnValue: true },
    });
    expect(decodeSsap('{"type":"error","id":"a","error":"403 User denied access"}')).toEqual({
      type: 'error',
      id: 'a',
      error: '403 User denied access',
    });
  });

  it('returns null for anything malformed', () => {
    expect(decodeSsap('nope')).toBeNull();
    expect(decodeSsap('{"type":"x"}')).toBeNull();
    expect(decodeSsap('null')).toBeNull();
    expect(decodeSsap('[]')).toBeNull();
    expect(decodeSsap('{"type":"response","payload":{}}')).toBeNull();
    expect(decodeSsap('{"type":"registered","id":"r","payload":{}}')).toBeNull();
    expect(decodeSsap('{"type":"error","id":"r"}')).toBeNull();
  });
});

describe('encodeSsap', () => {
  it('round-trips a request', () => {
    const text = encodeSsap({ type: 'request', id: 'a_1', uri: URI.volume });
    expect(JSON.parse(text)).toEqual({ type: 'request', id: 'a_1', uri: URI.volume });
  });
});

describe('constants', () => {
  it('uses the exact URIs', () => {
    expect(URI).toEqual({
      pointer: 'ssap://com.webos.service.networkinput/getPointerInputSocket',
      turnOff: 'ssap://system/turnOff',
      insertText: 'ssap://com.webos.service.ime/insertText',
      volume: 'ssap://audio/getVolume',
      foreground: 'ssap://com.webos.applicationManager/getForegroundAppInfo',
      launchPoints: 'ssap://com.webos.applicationManager/listLaunchPoints',
      power: 'ssap://com.webos.service.tvpower/power/getPowerState',
      netInfo: 'ssap://com.webos.service.connectionmanager/getinfo',
      launch: 'ssap://system.launcher/launch',
      inputs: 'ssap://tv/getExternalInputList',
      switchInput: 'ssap://tv/switchInput',
    });
  });

  it('maps keys to button names', () => {
    expect(KEY_BUTTON).toEqual({
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
      ok: 'ENTER',
      back: 'BACK',
      home: 'HOME',
      mute: 'MUTE',
      volumeUp: 'VOLUMEUP',
      volumeDown: 'VOLUMEDOWN',
    });
  });
});

describe('buttonFrame', () => {
  it('builds the pointer socket frame', () => {
    expect(buttonFrame('UP')).toBe('type:button\nname:UP\n\n');
  });
});

describe('parseVolume', () => {
  it('reads the older and newer firmware shapes', () => {
    expect(parseVolume({ volume: 18, muted: false })).toEqual({ volume: 18, muted: false });
    expect(parseVolume({ volumeStatus: { volume: 18, muteStatus: false } })).toEqual({
      volume: 18,
      muted: false,
    });
  });

  it('leaves out what is missing', () => {
    expect(parseVolume({})).toEqual({});
    expect(parseVolume({ volume: 'loud' })).toEqual({});
  });
});

describe('isPoweredOn', () => {
  it('maps power states', () => {
    expect(isPoweredOn({ state: 'Active' })).toBe(true);
    expect(isPoweredOn({ state: 'Screen Off' })).toBe(true);
    expect(isPoweredOn({ state: 'Active Standby' })).toBe(false);
    expect(isPoweredOn({ state: 'Suspend' })).toBe(false);
    expect(isPoweredOn({})).toBeUndefined();
    expect(isPoweredOn({ state: 'Something New' })).toBeUndefined();
  });
});

describe('parseMac', () => {
  it('lower-cases the wifi or wired MAC', () => {
    expect(parseMac({ wifiInfo: { macAddress: 'AA:BB:CC:00:11:22' } })).toBe('aa:bb:cc:00:11:22');
    expect(parseMac({ wiredInfo: { macAddress: 'AA:BB:CC:00:11:22' } })).toBe('aa:bb:cc:00:11:22');
  });

  it('prefers the connected interface', () => {
    expect(
      parseMac({
        wired: { state: 'disconnected' },
        wifi: { state: 'connected' },
        wiredInfo: { macAddress: '00:00:00:00:00:01' },
        wifiInfo: { macAddress: '00:00:00:00:00:02' },
      }),
    ).toBe('00:00:00:00:00:02');
  });

  it('is undefined without a valid MAC', () => {
    expect(parseMac({})).toBeUndefined();
    expect(parseMac({ wifiInfo: { macAddress: 'nope' } })).toBeUndefined();
  });
});

describe('parseInputs', () => {
  it('keeps id, label and connected, and skips malformed entries', () => {
    expect(
      parseInputs({
        returnValue: true,
        devices: [
          { id: 'HDMI_1', label: 'HDMI1', connected: true, appId: 'com.webos.app.hdmi1' },
          { id: 'HDMI_2', label: '', connected: 'yes' },
          { label: 'no id' },
          null,
        ],
      }),
    ).toEqual([
      { id: 'HDMI_1', label: 'HDMI1', connected: true },
      { id: 'HDMI_2', label: 'HDMI_2', connected: false },
    ]);
  });

  it('is empty without a device list', () => {
    expect(parseInputs({ returnValue: true })).toEqual([]);
  });
});
