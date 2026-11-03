import { withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { Motion } from '@/theme';

// Only for the ripple: a still, short touch is a tap (the same limits as the pad controller's).
const TAP_SLOP_PX = 10;
const TAP_MS = 250;

export interface PadVisualsDeps {
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** The finger dot: 0 hidden, 1 shown. */
  dot: SharedValue<number>;
  /** The hint text: 1 shown, 0 hidden. */
  hint: SharedValue<number>;
  motion: Motion;
  /** A tap ended here. */
  onTap: (x: number, y: number) => void;
  now?: () => number;
}

export interface PadVisuals {
  begin(x: number, y: number): void;
  update(x: number, y: number): void;
  /** `success` is the pan's own verdict, as for the controller. */
  end(x: number, y: number, success: boolean): void;
}

/**
 * Draws the pad's finger dot, hint fade and tap ripple from the gesture's own events. It only sets
 * shared values and never feeds the controller, so it cannot delay or change a key.
 */
export function createPadVisuals(deps: PadVisualsDeps): PadVisuals {
  const { x, y, dot, hint, motion } = deps;
  const now = deps.now ?? Date.now;
  let from = { x: 0, y: 0, at: 0 };
  return {
    begin(px, py) {
      from = { x: px, y: py, at: now() };
      x.set(px);
      y.set(py);
      dot.set(withTiming(1, motion.timing('fast')));
      hint.set(withTiming(0, motion.timing('base')));
    },
    update(px, py) {
      x.set(px);
      y.set(py);
    },
    end(px, py, success) {
      dot.set(withTiming(0, motion.timing('fast')));
      hint.set(withTiming(1, motion.timing('base')));
      if (
        success &&
        Math.hypot(px - from.x, py - from.y) <= TAP_SLOP_PX &&
        now() - from.at <= TAP_MS
      ) {
        deps.onTap(px, py);
      }
    },
  };
}
