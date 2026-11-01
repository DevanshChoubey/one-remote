import type { DeviceView } from '@/services';

export type TvMode = 'ready' | 'connecting' | 'off' | 'waking' | 'wakeFailed' | 'unreachable';

export const CONNECTING_MS = 5000;
export const WAKE_MS = 20000;

export interface TvModeEnv {
  onWifi: boolean;
  openedAt: number;
  wakeSentAt?: number;
  now: number;
}

/** What the TV screen should show. `null`: the hub has no view of the device yet. */
export function tvMode(v: DeviceView | null, env: TvModeEnv): TvMode {
  if (!env.onWifi) return 'unreachable';
  const reported = v?.state?.kind === 'tv' ? v.state.state.power : undefined;
  if (reported === true) return 'ready';
  if (env.wakeSentAt !== undefined) {
    return env.now - env.wakeSentAt < WAKE_MS ? 'waking' : 'wakeFailed';
  }
  if (reported === false) return 'off';
  return env.now - env.openedAt < CONNECTING_MS ? 'connecting' : 'unreachable';
}
