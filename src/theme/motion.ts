import { createContext, useContext } from 'react';
import { Easing } from 'react-native-reanimated';
import type { EasingFunctionFactory } from 'react-native-reanimated';
import { lightTokens } from './tokens';
import type { Tokens } from './tokens';

export type DurationName = keyof Tokens['motion']['duration'];
export type EaseName = keyof Tokens['motion']['easing'];

export interface Motion {
  /** The system asks for reduced motion (or a test forces it): moves become fades, loops stop. */
  reduced: boolean;
  duration: Tokens['motion']['duration'];
  ease: Record<EaseName, EasingFunctionFactory>;
  /** Rise distance in px; 0 when reduced. */
  lift: number;
  /** Delay between staggered items in ms; 0 when reduced. */
  stagger: number;
  timing(d: DurationName, e?: EaseName): { duration: number; easing: EasingFunctionFactory };
}

function bezier(tuple: Tokens['motion']['easing'][EaseName]): EasingFunctionFactory {
  return Easing.bezier(tuple[0], tuple[1], tuple[2], tuple[3]);
}

export function createMotion(motion: Tokens['motion'], reduced: boolean): Motion {
  const ease = {
    standard: bezier(motion.easing.standard),
    enter: bezier(motion.easing.enter),
    exit: bezier(motion.easing.exit),
    spring: bezier(motion.easing.spring),
  };
  return {
    reduced,
    duration: motion.duration,
    ease,
    lift: reduced ? 0 : motion.lift,
    stagger: reduced ? 0 : motion.stagger,
    timing: (d, e = 'standard') => ({ duration: motion.duration[d], easing: ease[e] }),
  };
}

export const MotionContext = createContext<Motion>(createMotion(lightTokens.motion, false));

export function useMotion(): Motion {
  return useContext(MotionContext);
}
