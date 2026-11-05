/**
 * MirAIe's HTTPS endpoints, MQTT broker and JSON fields, as written up in
 * `docs/protocol/miraie-cloud.md` (which says how sure each fact is). Pure mapping only.
 */
import type { AcFan, AcMode, AcState, MiraieAc } from '@/core';

export const MIRAIE_AUTH_HOST = 'auth.miraie.in';
export const MIRAIE_APP_HOST = 'app.miraie.in';
export const MIRAIE_BROKER_HOST = 'mqtt.miraie.in';
export const MIRAIE_BROKER_PORT = 8883;
/** Every host the app may reach on the internet, and only when the opt-in is on. */
export const MIRAIE_HOSTS: readonly string[] = [
  MIRAIE_AUTH_HOST,
  MIRAIE_APP_HOST,
  MIRAIE_BROKER_HOST,
];

/** The MirAIe app's public OAuth client id, as every community client sends it. Not a secret. */
export const MIRAIE_CLIENT_ID = 'PBcMcfG19njNCL8AOgvRzIC8AjQa';

export const LOGIN_URL = `https://${MIRAIE_AUTH_HOST}/simplifi/v1/userManagement/login`;
export const HOMES_URL = `https://${MIRAIE_APP_HOST}/simplifi/v1/homeManagement/homes`;
export const deviceUrl = (deviceId: string): string =>
  `https://${MIRAIE_APP_HOST}/simplifi/v1/deviceManagement/devices/${encodeURIComponent(deviceId)}`;
export const statusUrl = (deviceId: string): string => `${deviceUrl(deviceId)}/mobile/status`;

export const controlTopic = (root: string): string => `${root}/control`;
/** `status` (py-miraie-ac), `state` (hass-panasonic-miraie): unconfirmed which, so both. */
export const stateTopics = (root: string): string[] => [`${root}/status`, `${root}/state`];
export const connectionTopic = (root: string): string => `${root}/connectionStatus`;

/** Swing off: a fixed middle vane position. Unconfirmed (see the protocol note). */
export const SWING_OFF_POSITION = 3;
export const SETPOINT_MIN = 16;
export const SETPOINT_MAX = 30;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;

// ---- login ----

export interface MiraieTokens {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  /** ms since epoch; missing means unknown. */
  expiresAt?: number;
}

export function loginBody(phone: string, password: string, scopeDigits: string): string {
  return JSON.stringify({
    clientId: MIRAIE_CLIENT_ID,
    mobile: phone,
    password,
    scope: `an${scopeDigits}`,
  });
}

/** Null when the body has no usable token. */
export function parseLogin(body: string, now: number): MiraieTokens | null {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  const accessToken = str(v.accessToken);
  const userId = str(v.userId);
  if (!accessToken || !userId) return null;
  const refreshToken = str(v.refreshToken);
  const expiresIn = typeof v.expiresIn === 'number' ? v.expiresIn : Number(str(v.expiresIn));
  return {
    userId,
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expiresAt: now + expiresIn * 1000 } : {}),
  };
}

// ---- homes and devices ----

/** Every device of every home, with its topic root. Devices without an id or a topic are dropped. */
export function parseHomes(body: string): MiraieAc[] {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return [];
  }
  const homes = Array.isArray(v) ? v : [];
  const out: MiraieAc[] = [];
  for (const home of homes) {
    if (!isRecord(home)) continue;
    const homeId = str(home.homeId);
    if (!homeId || !Array.isArray(home.spaces)) continue;
    for (const space of home.spaces) {
      if (!isRecord(space) || !Array.isArray(space.devices)) continue;
      const spaceName = str(space.spaceName);
      for (const d of space.devices) {
        if (!isRecord(d)) continue;
        const deviceId = str(d.deviceId);
        const topic = Array.isArray(d.topic) ? str(d.topic[0]) : str(d.topic);
        if (!deviceId || !topic || /[+#]/.test(topic)) continue;
        out.push({
          deviceId,
          homeId,
          topic,
          name: str(d.deviceName)?.trim() || deviceId,
          ...(spaceName ? { space: spaceName } : {}),
        });
      }
    }
  }
  return out;
}

/** The device category from the details call (`[{ category: 'ac', ... }]`), lower case. */
export function parseCategory(body: string): string | null {
  try {
    const v: unknown = JSON.parse(body);
    const first: unknown = Array.isArray(v) ? v[0] : v;
    if (!isRecord(first)) return null;
    return str(first.category)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

// ---- commands ----

const FAN_OUT: Record<string, string> = { auto: 'auto', '1': 'low', '2': 'medium', '3': 'high' };
const FAN_IN: Record<string, AcFan> = { auto: 'auto', quiet: 1, low: 1, medium: 2, high: 3 };
const MODES: readonly AcMode[] = ['cool', 'dry', 'fan', 'auto'];

const base = (): Record<string, unknown> => ({ ki: 1, cnt: 'an', sid: '1' });

/**
 * The control messages that take the AC from `last` (null: unknown) to `next`, one setting per
 * message, as the MirAIe app sends them. Off is one message. Turning on sends `ps: on` and then
 * the mode (the AC may ignore power alone); every other field goes only when it changed.
 */
export function controlMessages(next: AcState, last: AcState | null): string[] {
  const msg = (field: string, value: unknown): string =>
    JSON.stringify({ ...base(), [field]: value });
  if (!next.power) return last && !last.power ? [] : [msg('ps', 'off')];
  const out: string[] = [];
  const turningOn = !last || !last.power;
  if (turningOn) out.push(msg('ps', 'on'));
  if (turningOn || last.mode !== next.mode) out.push(msg('acmd', next.mode));
  const setpoint = Math.min(SETPOINT_MAX, Math.max(SETPOINT_MIN, Math.round(next.setpoint)));
  if (!last || last.setpoint !== setpoint) out.push(msg('actmp', setpoint.toFixed(1)));
  if (!last || last.fan !== next.fan) out.push(msg('acfs', FAN_OUT[String(next.fan)] ?? 'auto'));
  if (!last || last.swing !== next.swing) {
    out.push(msg('acvs', next.swing ? 0 : SWING_OFF_POSITION));
  }
  return out;
}

// ---- status ----

export interface StatusUpdate {
  state: AcState;
  roomTemp?: number;
  /** From `onlineStatus`, when the message had it. */
  online?: boolean;
}

function parseOnline(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === 'online') return true;
  if (v === false || v === 'false' || v === 'offline') return false;
  return undefined;
}

/**
 * Merges one status message (MQTT or the HTTP status call) over `last`. Fields that are missing or
 * not understood keep their last value, so a partial message never resets anything. Null when the
 * text is not a JSON object.
 */
export function applyStatus(text: string, last: AcState): StatusUpdate | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  const state: AcState = { ...last };
  const ps = str(v.ps)?.toLowerCase();
  if (ps === 'on') state.power = true;
  else if (ps === 'off') state.power = false;
  const mode = str(v.acmd)?.toLowerCase();
  if (mode && (MODES as readonly string[]).includes(mode)) state.mode = mode as AcMode;
  const setpoint = Number(str(v.actmp));
  if (Number.isFinite(setpoint) && setpoint >= 10 && setpoint <= 35)
    state.setpoint = Math.round(setpoint);
  const fan = str(v.acfs)?.toLowerCase();
  if (fan && fan in FAN_IN) state.fan = FAN_IN[fan] ?? state.fan;
  const vs = str(v.acvs);
  if (vs !== undefined && /^\d+$/.test(vs)) state.swing = Number(vs) === 0;
  const room = Number(str(v.rmtmp));
  // Firmware 3.02+ packs rmtmp differently (unconfirmed): show nothing rather than a wrong number.
  const roomTemp = Number.isFinite(room) && room > 0 && room <= 60 ? room : undefined;
  const online = parseOnline(v.onlineStatus);
  return {
    state,
    ...(roomTemp !== undefined ? { roomTemp } : {}),
    ...(online !== undefined ? { online } : {}),
  };
}

/** The online flag of a `connectionStatus` message; undefined when the format is not understood. */
export function parseConnection(text: string): boolean | undefined {
  try {
    const v: unknown = JSON.parse(text);
    if (isRecord(v)) return parseOnline(v.onlineStatus ?? v.online ?? v.status);
    return parseOnline(v);
  } catch {
    return parseOnline(text.trim().toLowerCase());
  }
}
