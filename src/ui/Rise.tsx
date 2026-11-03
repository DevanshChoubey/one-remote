import { useEffect, useRef } from 'react';
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
  /** Layout the wrapper takes over from the card inside it (a card in a row keeps its flex). */
  flex?: number;
  testID?: string;
  children: ReactNode;
}

/** Content that rises into place on entry: fades in and lifts 14 px; reduced motion only fades. */
export function Rise(props: RiseProps): ReactElement {
  const motion = useMotion();
  const progress = useSharedValue(0);
  // The entrance plays once, on mount: a later change of index or motion does not restart it.
  const first = useRef({
    delay: (props.index ?? 0) * motion.stagger,
    timing: motion.timing('base', 'enter'),
  });
  useEffect(() => {
    const { delay, timing } = first.current;
    progress.value = withDelay(delay, withTiming(1, timing));
    return () => cancelAnimation(progress);
  }, [progress]);
  const lift = motion.lift;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * lift }],
  }));
  return (
    <AnimatedBox flex={props.flex} testID={props.testID} animatedStyle={animatedStyle}>
      {props.children}
    </AnimatedBox>
  );
}
