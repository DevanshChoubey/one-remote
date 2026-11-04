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
  /** xs 14 px (2 px ring, inline beside a caption), sm 20 px (the default), lg 36 px. */
  size?: 'xs' | 'sm' | 'lg';
  /** The mock's spinner is `currentColor`: ink by default; pass the colour of the text beside it. */
  color?: ColorToken;
}

const BLINK_MS = 1200;
/** Mock `.spinner` (20, 2.5), `.spinner.lg` (36, 3.5) and the inline caption one (14, 2). */
const LOOK = { xs: { box: 14, ring: 2 }, sm: { box: 20, ring: 2.5 }, lg: { box: 36, ring: 3.5 } };

/** An open ring turning once per 900 ms; under reduced motion it blinks instead. */
export function Spinner(props: SpinnerProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const look = LOOK[props.size ?? 'sm'];
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
  const ring = theme.color[props.color ?? 'ink'];
  const width = look.ring;
  const animatedStyle = useAnimatedStyle(() => ({
    borderWidth: width,
    borderColor: ring,
    borderRightColor: 'transparent',
    opacity: reduced ? blink.value : 1,
    transform: [{ rotate: `${turn.value}deg` }],
  }));
  return (
    <AnimatedBox
      w={look.box}
      h={look.box}
      radius="pill"
      animatedStyle={animatedStyle}
      pointerEvents="none"
    />
  );
}
