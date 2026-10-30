import type { FanState } from '@/core';
import type { FanKey } from './catalogue';

/**
 * The keys a fan remote must send to go from `prev` (what we last sent, if known) to `next`.
 * Speed keys are absolute, so they are safe to send. Boost, sleep and light are toggles: they are
 * sent only when the last state is known and the fan was on, never guessed.
 */
export function fanKeys(
  prev: FanState | undefined,
  next: FanState,
  keys: ReadonlySet<FanKey>,
): FanKey[] {
  if (!next.power) return keys.has('off') ? ['off'] : [];
  const out: FanKey[] = [];
  const add = (k: FanKey): void => {
    if (keys.has(k)) out.push(k);
  };
  const wasOn = prev?.power === true;
  if (!prev || !wasOn || prev.speed !== next.speed) add(`speed${next.speed}`);
  if (prev && wasOn) {
    if (prev.boost !== next.boost) add('boost');
    if (prev.sleep !== next.sleep) add('sleep');
    if ((prev.light ?? false) !== (next.light ?? false)) add('light');
  }
  const prevTimer = prev && wasOn ? prev.timerHours : 0;
  if (prevTimer !== next.timerHours) {
    add(next.timerHours === 0 ? 'timerOff' : (`timer${next.timerHours}` as FanKey));
  }
  return out;
}
