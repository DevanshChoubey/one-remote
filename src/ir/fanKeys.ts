import type { FanState } from '@/core';
import type { FanKey } from './catalogue';

/**
 * The keys a fan remote must send to go from `prev` (what we last sent, if known) to `next`.
 * Speed keys are absolute. Boost, sleep and light are toggles: a toggle that is unknown (prev
 * undefined, or the fan was off) is taken as off, which is the usual state after power on and how a
 * physical remote behaves. If the guess is wrong, the user presses again.
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
  const was = wasOn ? prev : undefined;
  if ((was?.boost ?? false) !== next.boost) add('boost');
  if ((was?.sleep ?? false) !== next.sleep) add('sleep');
  if ((was?.light ?? false) !== (next.light ?? false)) add('light');
  const prevTimer = prev && wasOn ? prev.timerHours : 0;
  if (prevTimer !== next.timerHours) {
    add(next.timerHours === 0 ? 'timerOff' : (`timer${next.timerHours}` as FanKey));
  }
  return out;
}
