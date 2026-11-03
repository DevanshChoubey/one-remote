import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { AnimatedBox } from './primitives/AnimatedBox';

export interface RiseProps {
  /** Position in a staggered list. */
  index?: number;
  children: ReactNode;
}

/** Content that rises into place on entry: fades in and lifts 14 px; reduced motion only fades. */
export function Rise(props: RiseProps): ReactElement {
  const motion = useMotion();
  const progress = useSharedValue(0);
  const delay = (props.index ?? 0) * motion.stagger;
  const { duration, easing } = motion.timing('base', 'enter');
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing }));
    return () => cancelAnimation(progress);
  }, [progress, delay, duration, easing]);
  const lift = motion.lift;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * lift }],
  }));
  return <AnimatedBox animatedStyle={animatedStyle}>{props.children}</AnimatedBox>;
}
