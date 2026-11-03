import { clampSetpoint, defaultAcState } from '@/core';
import type { AcState, Capabilities } from '@/core';
import type { DeviceView } from '@/services';

export interface AcView {
  state: AcState;
  source: 'reported' | 'lastSent' | 'none';
  roomTemp?: number;
  caps: Capabilities;
}

/** What the AC screen shows: the reported state, else the last one we sent, else the default. */
export function acView(v: DeviceView): AcView {
  const s = v.state;
  if (s?.kind === 'ac') {
    if ('lastSent' in s) return { state: s.state, source: 'lastSent', caps: v.capabilities };
    return {
      state: s.state,
      source: 'reported',
      ...(s.roomTemp !== undefined ? { roomTemp: s.roomTemp } : {}),
      caps: v.capabilities,
    };
  }
  return { state: defaultAcState(), source: 'none', caps: v.capabilities };
}

/** The full state after a press; the setpoint is kept within what the AC takes. */
export function nextAc(s: AcState, change: Partial<AcState>, caps: Capabilities): AcState {
  const merged = { ...s, ...change };
  return { ...merged, setpoint: clampSetpoint(merged.setpoint, caps) };
}
