export type DeviceKind = 'tv' | 'ac' | 'fan';
export type LinkKind = 'webos' | 'matter' | 'ir';

export type Link =
  | { kind: 'webos'; host: string; mac?: string; secure: boolean; clientKeyRef: string }
  | { kind: 'matter'; nodeId: string }
  | { kind: 'ir'; remoteId: string }; // catalogue id, e.g. 'panasonic-ac/dke'

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
export type AcFan = 'auto' | 1 | 2 | 3;

export interface AcState {
  power: boolean;
  mode: AcMode;
  setpoint: number;
  fan: AcFan;
  swing: boolean;
  sleep: boolean;
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

export interface Capabilities {
  acModes?: AcMode[];
  acFan?: AcFan[];
  setpoint?: { min: number; max: number };
  swing?: boolean;
  sleep?: boolean;
  fanLight?: boolean;
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

export function defaultFanState(): FanState {
  return { power: false, speed: 3, boost: false, sleep: false, timerHours: 0 };
}

export function clampSetpoint(n: number, caps?: Capabilities): number {
  const min = caps?.setpoint?.min ?? DEFAULT_SETPOINT_MIN;
  const max = caps?.setpoint?.max ?? DEFAULT_SETPOINT_MAX;
  return Math.min(max, Math.max(min, n));
}
