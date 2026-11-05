import { useEffect } from 'react';
import type { ReactElement } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { ColorToken } from '@/theme';
import { useMotion } from '@/theme';
import { AnimatedBox } from './primitives/AnimatedBox';

export interface StatusDotProps {
  tone: 'ok' | 'warn' | 'err';
  /** Blinks (1.4 s) while a link is being checked; stays still under reduced motion. */
  live?: boolean;
  testID?: string;
}

const TONE: Record<StatusDotProps['tone'], ColorToken> = { ok: 'ok', warn: 'warm', err: 'danger' };

const BLINK_MS = 1400;
const BLINK_LOW = 0.35;

export function StatusDot(props: StatusDotProps): ReactElement {
  const motion = useMotion();
  const opacity = useSharedValue(1);
  const blink = props.live === true && !motion.reduced;
  useEffect(() => {
    if (!blink) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return undefined;
    }
    const half = { duration: BLINK_MS / 2, easing: motion.ease.standard };
    opacity.value = withRepeat(withSequence(withTiming(BLINK_LOW, half), withTiming(1, half)), -1);
    return () => cancelAnimation(opacity);
  }, [blink, opacity, motion.ease.standard]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <AnimatedBox
      w={8}
      h={8}
      radius="pill"
      bg={TONE[props.tone]}
      animatedStyle={animatedStyle}
      testID={props.testID}
    />
  );
}
