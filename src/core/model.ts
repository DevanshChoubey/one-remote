export type DeviceKind = 'tv' | 'ac' | 'fan' | 'aer';
export type LinkKind = 'webos' | 'androidtv' | 'samsung' | 'matter' | 'ir' | 'aer' | 'gree';

/** The GATT characteristic UUIDs of an air freshener. Missing means the defaults. */
export interface AerChannels {
  reply: string;
  command: string;
  schedule: string;
}

export type Link =
  | { kind: 'webos'; host: string; mac?: string; secure: boolean; clientKeyRef: string }
  | { kind: 'androidtv'; host: string; mac?: string; certRef: string; pinSha256: string }
  | { kind: 'samsung'; host: string; mac?: string; tokenRef: string; pinSha256: string }
  | { kind: 'matter'; nodeId: string }
  | { kind: 'ir'; remoteId: string } // catalogue id, e.g. 'panasonic-ac/dke'
  | { kind: 'aer'; bleId: string; timeZone: string; channels?: AerChannels }
  // A Gree Wi-Fi unit on the home network. `key` is what any phone on the LAN gets from the unit's
  // own bind (no account, no cloud), so it is kept on the link; `cipher` is its firmware generation.
  | { kind: 'gree'; mac: string; host: string; key: string; cipher: 'ecb' | 'gcm' };

export interface Room {
  id: string;
  name: string;
  order: number;
}

export interface Device {
  id: string;
  kind: DeviceKind;
  name: string;
  roomId: string;
  order: number;
  links: Link[];
}

export type AcMode = 'cool' | 'dry' | 'fan' | 'auto';
/** Fan speed. Most ACs take 1..3; five-speed ACs (Panasonic Min..Max) take 1..5. */
export type AcFan = 'auto' | 1 | 2 | 3 | 4 | 5;
/** Vertical vane: auto (swinging) or a fixed position, 1 highest to 5 lowest. */
export type AcSwingV = 'auto' | 1 | 2 | 3 | 4 | 5;
/** Horizontal vanes: auto (swinging) or a fixed direction. */
export type AcSwingH = 'auto' | 'fullLeft' | 'left' | 'middle' | 'right' | 'fullRight';

export interface AcState {
  power: boolean;
  mode: AcMode;
  setpoint: number;
  fan: AcFan;
  /** Vertical swing on (auto) or off. Kept in step with `swingV` when that is set. */
  swing: boolean;
  sleep: boolean;
  /** Vertical position; missing means `swing` decides (on: auto, off: the middle, 3). */
  swingV?: AcSwingV;
  /** Horizontal direction; missing means the middle. */
  swingH?: AcSwingH;
  /** Powerful (turbo). Never on together with `quiet`. */
  powerful?: boolean;
  quiet?: boolean;
  /** Ion air purifier (Panasonic nanoe). */
  ion?: boolean;
}

export type FanSpeed = 1 | 2 | 3 | 4 | 5;

export interface FanState {
  power: boolean;
  speed: FanSpeed;
  boost: boolean;
  sleep: boolean;
  timerHours: 0 | 1 | 2 | 4 | 8;
  light?: boolean;
}

export type TvKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'home'
  | 'mute'
  | 'volumeUp'
  | 'volumeDown'
  | 'playPause'
  | 'input'
  | 'power';

export interface TvInput {
  /** The TV's id for the input, e.g. `HDMI_1`. */
  id: string;
  /** The name the TV shows, which the user may have changed. */
  label: string;
  /** Something is plugged in. */
  connected: boolean;
}

export interface TvState {
  power: boolean;
  app?: string;
  volume?: number;
  muted?: boolean;
  inputs?: TvInput[];
  /** The id of the input the TV is showing now (no driver sets it yet). */
  currentInputId?: string;
}

export type Command =
  | { kind: 'tv.key'; key: TvKey }
  | { kind: 'tv.text'; text: string }
  | { kind: 'tv.powerOn' }
  | { kind: 'tv.input'; inputId: string }
  | { kind: 'ac.set'; state: AcState }
  | { kind: 'fan.set'; state: FanState };

export type Reported =
  { kind: 'tv'; state: TvState } | { kind: 'ac'; state: AcState; roomTemp?: number };

export interface TvCaps {
  /** The TV lists its inputs (in-app sheet); false: the Input button sends the `input` key. */
  inputList: boolean;
  /** Text can be typed into a TV text field. */
  text: boolean;
  /** `tv.powerOn` can work for this TV from this phone. */
  powerOn: boolean;
  /** The TV takes phone audio (a voice session over the link). */
  voice: boolean;
}

export interface Capabilities {
  acModes?: AcMode[];
  acFan?: AcFan[];
  setpoint?: { min: number; max: number };
  swing?: boolean;
  sleep?: boolean;
  /** Vertical positions 1..5 as well as auto. Missing means not supported. */
  swingV?: boolean;
  /** Horizontal directions. Missing means not supported. */
  swingH?: boolean;
  /** Powerful (turbo). Missing means not supported. */
  powerful?: boolean;
  /** Quiet. Missing means not supported. */
  quiet?: boolean;
  /** Ion air purifier (nanoe). Missing means not supported. */
  ion?: boolean;
  fanLight?: boolean;
  tv?: TvCaps;
  /** Fan Boost key. Missing means supported. */
  fanBoost?: boolean;
  /** Fan timer keys. Missing means supported. */
  fanTimer?: boolean;
}

const DEFAULT_SETPOINT_MIN = 16;
const DEFAULT_SETPOINT_MAX = 30;

/** Commands that set absolute state or are safe to repeat. Key presses are not. */
export function isIdempotent(cmd: Command): boolean {
  return (
    cmd.kind === 'ac.set' ||
    cmd.kind === 'fan.set' ||
    cmd.kind === 'tv.powerOn' ||
    cmd.kind === 'tv.input'
  );
}

export function defaultAcState(): AcState {
  return { power: false, mode: 'cool', setpoint: 24, fan: 'auto', swing: false, sleep: false };
}

/** The vertical position to send: `swingV`, else what the old `swing` flag meant. */
export function acSwingV(s: AcState): AcSwingV {
  return s.swingV ?? (s.swing ? 'auto' : 3);
}

/** The horizontal direction to send; the middle when not set. */
export function acSwingH(s: AcState): AcSwingH {
  return s.swingH ?? 'middle';
}

export function defaultFanState(): FanState {
  return { power: false, speed: 3, boost: false, sleep: false, timerHours: 0 };
}

export function clampSetpoint(n: number, caps?: Capabilities): number {
  const min = caps?.setpoint?.min ?? DEFAULT_SETPOINT_MIN;
  const max = caps?.setpoint?.max ?? DEFAULT_SETPOINT_MAX;
  return Math.min(max, Math.max(min, n));
}
