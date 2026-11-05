import { useEffect } from 'react';
import type { ReactElement } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { AnimatedBox } from './primitives/AnimatedBox';
import { Box } from './primitives';

export interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  label: string;
  /** The fill colour: `warm` for low and `danger` for empty (mock `.stat.low`, `.stat.bad`). */
  tone?: 'accent' | 'warm' | 'danger';
}

export function ProgressBar(props: ProgressBarProps): ReactElement {
  const motion = useMotion();
  const pct = Math.round(Math.min(1, Math.max(0, props.value)) * 100);
  const shown = useSharedValue(pct);
  const { duration, easing } = motion.timing('base');
  const reduced = motion.reduced;
  useEffect(() => {
    if (reduced) {
      cancelAnimation(shown);
      shown.value = pct;
    } else {
      shown.value = withTiming(pct, { duration, easing });
    }
  }, [pct, reduced, duration, easing, shown]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${shown.value}%` }));
  return (
    <Box
      h={6}
      bg="line"
      radius="pill"
      accessibilityLabel={props.label}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <AnimatedBox
        h={6}
        bg={props.tone ?? 'accent'}
        radius="pill"
        animatedStyle={fillStyle}
        testID="progress-fill"
      />
    </Box>
  );
}
