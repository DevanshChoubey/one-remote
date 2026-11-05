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

/**
 * The full state after a press. The setpoint is kept within what the AC takes, Powerful and Quiet
 * never stay on together, and the old `swing` flag follows a vertical position (auto is swing on).
 */
export function nextAc(s: AcState, change: Partial<AcState>, caps: Capabilities): AcState {
  const merged: AcState = {
    ...s,
    ...change,
    setpoint: clampSetpoint(change.setpoint ?? s.setpoint, caps),
  };
  if (change.powerful === true) merged.quiet = false;
  if (change.quiet === true) merged.powerful = false;
  if (change.swingV !== undefined) {
    merged.swing = change.swingV === 'auto';
  } else if (change.swing !== undefined && s.swingV !== undefined) {
    // The Swing chip: on is auto; off leaves a fixed position where it was, or the middle.
    merged.swingV = change.swing ? 'auto' : s.swingV === 'auto' ? 3 : s.swingV;
  }
  return merged;
}
