import { batteryPercent, isBatteryTooLow, refillPercent } from '@/services';
import type { AerProblem, AerView } from '@/services';

export type AerScreenState =
  'ready' | 'spraying' | 'connecting' | 'btoff' | 'denied' | 'away' | 'busy' | 'flat' | 'low';

/** Below this refill percentage the dispenser is nearly out. */
export const REFILL_LOW_PERCENT = 10;

/** Below this battery percentage the level is drawn red. */
export const BATTERY_LOW_PERCENT = 10;

const LIVE: readonly AerScreenState[] = ['ready', 'spraying', 'low'];
const CACHED: readonly AerScreenState[] = ['connecting', 'btoff', 'denied', 'away', 'busy'];

/** The dispenser answered: Spray and the controls work. */
export const isLive = (s: AerScreenState): boolean => LIVE.includes(s);
/** The screen shows what it last read, dimmed. */
export const isCached = (s: AerScreenState): boolean => CACHED.includes(s);

/** True when the last reading says the batteries are too flat to spray. */
export function isFlat(view: AerView): boolean {
  return view.status !== undefined && isBatteryTooLow(view.status.batteryMv);
}

/** True when the last reading says the refill is almost out. */
export function isRefillLow(view: AerView): boolean {
  return (
    view.status !== undefined && refillPercent(view.status.spraysSinceRefill) < REFILL_LOW_PERCENT
  );
}

/** The levels line's two numbers, or null before the first reading. */
export function levels(view: AerView): { battery: number; refill: number } | null {
  if (!view.status) return null;
  return {
    battery: batteryPercent(view.status.batteryMv),
    refill: refillPercent(view.status.spraysSinceRefill),
  };
}

const SHOWN: Partial<Record<AerProblem, AerScreenState>> = {
  btoff: 'btoff',
  denied: 'denied',
  away: 'away',
  busy: 'busy',
  flat: 'flat',
};

/** The one state the dispenser screen draws: the running operation first, then the problem, then the reading. */
export function aerScreenState(
  view: AerView,
  op: 'connecting' | 'spraying' | null,
  problem: AerProblem | null,
): AerScreenState {
  if (op) return op;
  const shown = problem ? SHOWN[problem] : undefined;
  if (shown) return shown;
  if (isFlat(view)) return 'flat';
  if (isRefillLow(view)) return 'low';
  return 'ready';
}
