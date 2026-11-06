import { clampSetpoint } from '@/core';
import type { AcFan, AcMode, AcState, Capabilities } from '@/core';
import type { MatterAcAttrs, MatterAcInfo, MatterWrite } from './controller';

export const SYSTEM_MODE = { off: 0, auto: 1, cool: 3, fanOnly: 7, dry: 8 } as const;
export const FAN_MODE = { off: 0, low: 1, medium: 2, high: 3, on: 4, auto: 5 } as const;

const ALL_MODES: AcMode[] = ['cool', 'dry', 'fan', 'auto'];

const MODE_TO_SYSTEM: Record<AcMode, number> = {
  cool: SYSTEM_MODE.cool,
  dry: SYSTEM_MODE.dry,
  fan: SYSTEM_MODE.fanOnly,
  auto: SYSTEM_MODE.auto,
};

const FAN_TO_MATTER: Record<string, number> = {
  auto: FAN_MODE.auto,
  '1': FAN_MODE.low,
  '2': FAN_MODE.medium,
  '3': FAN_MODE.high,
  // Matter's FanMode has three levels: a five-speed AC's top speeds are High.
  '4': FAN_MODE.high,
  '5': FAN_MODE.high,
};

export function capabilitiesFrom(info: MatterAcInfo): Capabilities {
  const modes = info.systemModes;
  const acModes = modes
    ? ALL_MODES.filter((m) => modes.includes(MODE_TO_SYSTEM[m]))
    : [...ALL_MODES];
  return {
    setpoint: { min: info.absMinCool / 100, max: info.absMaxCool / 100 },
    acModes,
    acFan: fansFor(info.fanModeSequence),
    swing: (info.rockSupport ?? 0) > 0,
    sleep: false,
  };
}

function fansFor(seq: number | undefined): AcFan[] {
  switch (seq) {
    case 0:
      return [1, 2, 3];
    case 1:
      return [1, 3];
    case 2:
      return [1, 2, 3, 'auto'];
    case 3:
      return [1, 3, 'auto'];
    case 4:
    case 5:
      return ['auto'];
    default:
      return [];
  }
}

/** The writes that bring the AC to `s`, in send order. */
export function toWrites(s: AcState, info: MatterAcInfo): MatterWrite[] {
  if (!s.power) {
    return [info.hasOnOff ? { onOff: false } : { systemMode: SYSTEM_MODE.off }];
  }
  const writes: MatterWrite[] = [];
  if (info.hasOnOff) writes.push({ onOff: true });
  writes.push({ systemMode: MODE_TO_SYSTEM[s.mode] });
  writes.push({
    occupiedCoolingSetpoint: Math.round(clampSetpoint(s.setpoint, capabilitiesFrom(info)) * 100),
  });
  if (info.fanModeSequence !== undefined) writes.push({ fanMode: FAN_TO_MATTER[String(s.fan)] });
  const rock = info.rockSupport ?? 0;
  if (rock > 0) writes.push({ rockSetting: s.swing ? rock : 0 });
  return writes;
}

function modeFrom(systemMode: number, last: AcMode): AcMode {
  switch (systemMode) {
    case SYSTEM_MODE.cool:
      return 'cool';
    case SYSTEM_MODE.dry:
      return 'dry';
    case SYSTEM_MODE.fanOnly:
      return 'fan';
    case SYSTEM_MODE.auto:
      return 'auto';
    default:
      return last;
  }
}

function fanFrom(fanMode: number | undefined, last: AcFan): AcFan {
  switch (fanMode) {
    case FAN_MODE.low:
      return 1;
    case FAN_MODE.medium:
      return 2;
    case FAN_MODE.high:
      return 3;
    case FAN_MODE.on:
    case FAN_MODE.auto:
      return 'auto';
    default:
      return last;
  }
}

export function fromAttrs(a: MatterAcAttrs, last: AcState): { state: AcState; roomTemp?: number } {
  const off = a.onOff === false || a.systemMode === SYSTEM_MODE.off;
  const state: AcState = {
    power: !off,
    mode: off ? last.mode : modeFrom(a.systemMode, last.mode),
    setpoint: Math.round(a.occupiedCoolingSetpoint / 100),
    fan: fanFrom(a.fanMode, last.fan),
    swing: a.rockSetting === undefined ? last.swing : a.rockSetting > 0,
    sleep: last.sleep,
  };
  return a.localTemperature === null ? { state } : { state, roomTemp: a.localTemperature / 100 };
}
