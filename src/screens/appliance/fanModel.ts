import type { Capabilities, FanState } from '@/core';
import type { DeviceView } from '@/services';

const DEFAULT_FAN: FanState = { power: false, speed: 1, boost: false, sleep: false, timerHours: 0 };

/** What the fan screen shows: the state we last sent, else a fan that is off. */
export function fanView(v: DeviceView): { state: FanState; caps: Capabilities } {
  const s = v.state;
  return {
    state: s?.kind === 'fan' ? s.state : { ...DEFAULT_FAN },
    caps: v.capabilities,
  };
}
