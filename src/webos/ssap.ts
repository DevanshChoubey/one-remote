import type { TvInput, TvKey } from '@/core';

export type SsapOut =
  | {
      type: 'register';
      id: string;
      payload: {
        forcePairing: false;
        pairingType: 'PROMPT';
        'client-key'?: string;
        manifest: object;
      };
    }
  | { type: 'request' | 'subscribe'; id: string; uri: string; payload?: object }
  | { type: 'unsubscribe'; id: string };

export type SsapIn =
  | { type: 'response'; id: string; payload: Record<string, unknown> }
  | { type: 'registered'; id: string; payload: { 'client-key': string } }
  | { type: 'error'; id: string; error: string; payload?: Record<string, unknown> };

export function encodeSsap(m: SsapOut): string {
  return JSON.stringify(m);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Null for anything malformed. */
export function decodeSsap(text: string): SsapIn | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const { id } = raw;
  const payload = isRecord(raw.payload) ? raw.payload : undefined;
  if (raw.type === 'response') {
    return payload ? { type: 'response', id, payload } : null;
  }
  if (raw.type === 'registered') {
    const key = payload?.['client-key'];
    return typeof key === 'string'
      ? { type: 'registered', id, payload: { 'client-key': key } }
      : null;
  }
  if (raw.type === 'error') {
    if (typeof raw.error !== 'string') return null;
    return payload
      ? { type: 'error', id, error: raw.error, payload }
      : { type: 'error', id, error: raw.error };
  }
  return null;
}

export const URI = {
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
} as const;

/** A frame for the pointer input socket. */
export function buttonFrame(name: string): string {
  return `type:button\nname:${name}\n\n`;
}

export const KEY_BUTTON: Record<Exclude<TvKey, 'playPause' | 'input' | 'power'>, string> = {
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
};

/** Older firmware: `{ volume, muted }`. Newer: `{ volumeStatus: { volume, muteStatus } }`. */
export function parseVolume(p: Record<string, unknown>): { volume?: number; muted?: boolean } {
  const src = isRecord(p.volumeStatus) ? p.volumeStatus : p;
  const muted = typeof src.muteStatus === 'boolean' ? src.muteStatus : src.muted;
  const out: { volume?: number; muted?: boolean } = {};
  if (typeof src.volume === 'number') out.volume = src.volume;
  if (typeof muted === 'boolean') out.muted = muted;
  return out;
}

const ON_STATES = ['Active', 'Screen Off', 'Screen Saver'];
const OFF_STATES = ['Active Standby', 'Suspend', 'Power Off'];

/** True when the screen side of the TV is up (a dark screen still counts); undefined if unknown. */
export function isPoweredOn(p: Record<string, unknown>): boolean | undefined {
  const s = p.state;
  if (typeof s !== 'string') return undefined;
  if (ON_STATES.includes(s)) return true;
  if (OFF_STATES.includes(s)) return false;
  return undefined;
}

const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;

function macOf(info: unknown): string | undefined {
  if (!isRecord(info) || typeof info.macAddress !== 'string') return undefined;
  return MAC_RE.test(info.macAddress)
    ? info.macAddress.toLowerCase().replace(/-/g, ':')
    : undefined;
}

/** Lower-case `aa:bb:...`. When both interfaces report a MAC, the connected one wins. */
export function parseMac(p: Record<string, unknown>): string | undefined {
  const wifi = macOf(p.wifiInfo);
  const wired = macOf(p.wiredInfo);
  const connected = (v: unknown): boolean => isRecord(v) && v.state === 'connected';
  if (wired && wifi) return connected(p.wired) && !connected(p.wifi) ? wired : wifi;
  return wifi ?? wired;
}

/** The TV's external inputs from `getExternalInputList`; malformed entries are skipped. */
export function parseInputs(p: Record<string, unknown>): TvInput[] {
  if (!Array.isArray(p.devices)) return [];
  const out: TvInput[] = [];
  for (const d of p.devices as unknown[]) {
    if (!isRecord(d) || typeof d.id !== 'string' || d.id === '') continue;
    const label = typeof d.label === 'string' && d.label !== '' ? d.label : d.id;
    out.push({ id: d.id, label, connected: d.connected === true });
  }
  return out;
}
