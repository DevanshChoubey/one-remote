import { useEffect } from 'react';
import type { ReactElement } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import type { ColorToken } from '@/theme';
import { AnimatedBox } from './primitives/AnimatedBox';

export interface SpinnerProps {
  size?: 'sm' | 'lg';
  color?: ColorToken;
}

const BLINK_MS = 1200;

/** An open ring turning once per 900 ms; under reduced motion it blinks instead. */
export function Spinner(props: SpinnerProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const large = props.size === 'lg';
  const turn = useSharedValue(0);
  const blink = useSharedValue(1);
  const reduced = motion.reduced;
  const spinMs = motion.duration.spinner;
  useEffect(() => {
    cancelAnimation(turn);
    cancelAnimation(blink);
    turn.value = 0;
    blink.value = 1;
    if (reduced) {
      const half = { duration: BLINK_MS / 2, easing: motion.ease.standard };
      blink.value = withRepeat(withSequence(withTiming(0.35, half), withTiming(1, half)), -1);
    } else {
      turn.value = withRepeat(withTiming(360, { duration: spinMs, easing: Easing.linear }), -1);
    }
    return () => {
      cancelAnimation(turn);
      cancelAnimation(blink);
    };
  }, [reduced, spinMs, turn, blink, motion.ease.standard]);
  const ring = theme.color[props.color ?? 'accent'];
  const width = large ? 3.5 : 2.5;
  const animatedStyle = useAnimatedStyle(() => ({
    borderWidth: width,
    borderColor: ring,
    borderRightColor: 'transparent',
    opacity: reduced ? blink.value : 0.9,
    transform: [{ rotate: `${turn.value}deg` }],
  }));
  return (
    <AnimatedBox
      w={large ? 36 : 20}
      h={large ? 36 : 20}
      radius="pill"
      animatedStyle={animatedStyle}
      pointerEvents="none"
    />
  );
}
