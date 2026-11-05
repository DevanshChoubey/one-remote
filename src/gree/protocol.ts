// Gree local protocol messages (UDP port 7000), written from the protocol description: the outer
// JSON envelope, the scan, bind, status and cmd packs, and the parameter names and values.
import type { AcFan, AcMode, AcState } from '@/core';
import { GENERIC_KEY, GreeCryptoError, decryptPack, encryptPack } from './crypto';
import type { GreeCipher, SealedPack } from './crypto';

export const GREE_PORT = 7000;

/** A unit that answered a scan. */
export interface GreeFound {
  /** Lower-case hex, no separators, as the unit reports it (its `cid`). */
  mac: string;
  host: string;
  /** The unit's own name (often a hex id), may be empty. */
  name: string;
  cipher: GreeCipher;
  brand?: string;
  model?: string;
  version?: string;
}

export type Json = Record<string, unknown>;

/** A reply that is not a Gree pack, or one that says something failed. */
export class GreeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GreeProtocolError';
    Object.setPrototypeOf(this, GreeProtocolError.prototype);
  }
}

const MAC = /^[0-9a-f]{12}$/;
const DEVICE_KEY = /^[\x21-\x7e]{16}$/;

export function normaliseMac(mac: string): string | null {
  const m = mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  return MAC.test(m) ? m : null;
}

export function isDeviceKey(key: unknown): key is string {
  return typeof key === 'string' && DEVICE_KEY.test(key);
}

function parseJson(text: string): Json {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new GreeProtocolError('Not JSON');
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new GreeProtocolError('Not a JSON object');
  }
  return v as Json;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export function scanRequest(): string {
  return JSON.stringify({ t: 'scan' });
}

/** The outer envelope around an encrypted pack, addressed to the unit `mac`. */
export function packMessage(
  inner: Json,
  mac: string,
  key: string,
  cipher: GreeCipher,
  i: 0 | 1,
): string {
  const sealed = encryptPack(JSON.stringify(inner), key, cipher);
  return JSON.stringify({
    cid: 'app',
    i,
    pack: sealed.pack,
    t: 'pack',
    tcid: mac,
    uid: 0,
    ...(sealed.tag !== undefined ? { tag: sealed.tag } : {}),
  });
}

/** Opens a reply envelope with `key`. A reply carrying a `tag` is GCM whatever `cipher` says. */
export function openMessage(text: string, key: string, cipher: GreeCipher): Json {
  const outer = parseJson(text);
  const pack = str(outer.pack);
  if (outer.t !== 'pack' || pack === undefined) throw new GreeProtocolError('Not a pack');
  const tag = str(outer.tag);
  const sealed: SealedPack = tag !== undefined ? { pack, tag } : { pack };
  return parseJson(decryptPack(sealed, key, tag !== undefined ? 'gcm' : cipher));
}

/** A scan reply, or null for anything else on port 7000 (wrong JSON, not a unit). */
export function parseScanReply(text: string, host: string): GreeFound | null {
  let outer: Json;
  try {
    outer = parseJson(text);
  } catch {
    return null;
  }
  const cipher: GreeCipher = str(outer.tag) !== undefined ? 'gcm' : 'ecb';
  let inner: Json;
  try {
    inner = openMessage(text, GENERIC_KEY[cipher], cipher);
  } catch (e) {
    if (e instanceof GreeProtocolError || e instanceof GreeCryptoError) return null;
    throw e;
  }
  if (inner.t !== 'dev') return null;
  const mac = normaliseMac(str(inner.mac) ?? str(outer.cid) ?? '');
  if (mac === null) return null;
  const brand = str(inner.brand);
  const model = str(inner.model);
  const version = str(inner.ver);
  return {
    mac,
    host,
    name: str(inner.name) ?? '',
    cipher,
    ...(brand ? { brand } : {}),
    ...(model ? { model } : {}),
    ...(version ? { version } : {}),
  };
}

export function bindPack(mac: string, cipher: GreeCipher): Json {
  return cipher === 'gcm' ? { cid: mac, mac, t: 'bind', uid: 0 } : { mac, t: 'bind', uid: 0 };
}

/** The device key from a `bindok` pack. */
export function parseBindOk(inner: Json): string {
  if (inner.t !== 'bindok') throw new GreeProtocolError('Not a bind reply');
  if (inner.r !== undefined && inner.r !== 200) throw new GreeProtocolError('Bind refused');
  if (!isDeviceKey(inner.key)) throw new GreeProtocolError('No device key');
  return inner.key;
}

// ---- state -------------------------------------------------------------------------------------

/** What a status read asks for. */
export const STATUS_COLS = ['Pow', 'Mod', 'SetTem', 'TemUn', 'WdSpd', 'SwUpDn', 'SwhSlp', 'TemSen'];

const MODE_TO_GREE: Record<AcMode, number> = { auto: 0, cool: 1, dry: 2, fan: 3 };
const FAN_TO_GREE: Record<string, number> = { auto: 0, '1': 1, '2': 3, '3': 5 };
/** SwUpDn 1 is full swing and 7-11 swing within a region; 0 is the default stop, 2-6 fixed. */
const SWINGING = new Set([1, 7, 8, 9, 10, 11]);

export const SETPOINT_MIN = 16;
export const SETPOINT_MAX = 30;

export function statusPack(mac: string): Json {
  return { cols: STATUS_COLS, mac, t: 'status' };
}

/** The absolute state as one cmd: every field is set, so the unit ends up exactly there. */
export function cmdPack(state: AcState): Json {
  const setpoint = Math.round(Math.min(SETPOINT_MAX, Math.max(SETPOINT_MIN, state.setpoint)));
  const sleep = state.sleep ? 1 : 0;
  const pairs: [string, number][] = [
    ['Pow', state.power ? 1 : 0],
    ['Mod', MODE_TO_GREE[state.mode]],
    ['TemUn', 0],
    ['SetTem', setpoint],
    ['WdSpd', FAN_TO_GREE[String(state.fan)] ?? 0],
    ['SwUpDn', state.swing ? 1 : 0],
    ['SwhSlp', sleep],
    ['SlpMod', sleep],
  ];
  return { opt: pairs.map((p) => p[0]), p: pairs.map((p) => p[1]), t: 'cmd' };
}

/** A cmd reply: `r` 200 means the unit took it. */
export function checkCmdReply(inner: Json): void {
  if (inner.t !== 'res') throw new GreeProtocolError('Not a cmd reply');
  if (inner.r !== 200) throw new GreeProtocolError(`Refused (${String(inner.r)})`);
}

function modeFrom(v: number | undefined, prev: AcMode): AcMode {
  switch (v) {
    case 0:
      return 'auto';
    case 1:
      return 'cool';
    case 2:
      return 'dry';
    case 3:
      return 'fan';
    default:
      // Heat (4) or unknown: the app has no such mode, keep what it had.
      return prev;
  }
}

function fanFrom(v: number | undefined, prev: AcFan): AcFan {
  if (v === 0) return 'auto';
  if (v === 1 || v === 2) return 1;
  if (v === 3) return 2;
  if (v === 4 || v === 5) return 3;
  return prev;
}

/** Room temperature: most firmware adds 40 (65 is 25 °C); 0 means no sensor. */
function roomTempFrom(v: number | undefined): number | undefined {
  if (v === undefined || v <= 0) return undefined;
  return v >= 40 ? v - 40 : v;
}

/** A `dat` pack as the app's state; fields the unit leaves out keep `prev`. */
export function parseStatus(inner: Json, prev: AcState): { state: AcState; roomTemp?: number } {
  if (inner.t !== 'dat') throw new GreeProtocolError('Not a status reply');
  const cols = inner.cols;
  const dat = inner.dat;
  if (!Array.isArray(cols) || !Array.isArray(dat)) throw new GreeProtocolError('No status data');
  const values = new Map<string, number>();
  cols.forEach((c, i) => {
    const v: unknown = dat[i];
    if (typeof c === 'string' && typeof v === 'number' && Number.isFinite(v)) values.set(c, v);
  });
  const pow = values.get('Pow');
  const setTem = values.get('SetTem');
  const swing = values.get('SwUpDn');
  const sleep = values.get('SwhSlp');
  // A Fahrenheit unit reports SetTem in °F; the app shows °C, so leave the setpoint as it was.
  const celsius = (values.get('TemUn') ?? 0) === 0;
  const state: AcState = {
    power: pow === undefined ? prev.power : pow === 1,
    mode: modeFrom(values.get('Mod'), prev.mode),
    setpoint:
      setTem !== undefined && celsius && setTem >= SETPOINT_MIN && setTem <= SETPOINT_MAX
        ? setTem
        : prev.setpoint,
    fan: fanFrom(values.get('WdSpd'), prev.fan),
    swing: swing === undefined ? prev.swing : SWINGING.has(swing),
    sleep: sleep === undefined ? prev.sleep : sleep === 1,
  };
  const roomTemp = roomTempFrom(values.get('TemSen'));
  return roomTemp === undefined ? { state } : { state, roomTemp };
}
