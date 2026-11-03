import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';

export interface TapRippleProps {
  x: number;
  y: number;
  /** Changes (counts up) on every tap; 0 means none yet. */
  trigger: number;
}

const RING = 44;

/** The tap ripple: a 44 px accent ring growing from .6 to 2.6 as it fades, over `base`. */
export function TapRipple(props: TapRippleProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const { reduced } = motion;
  const progress = useSharedValue(1);
  const { trigger } = props;
  useEffect(() => {
    if (trigger === 0) return;
    progress.value = 0;
    progress.value = withTiming(1, motion.timing('base'));
    return () => cancelAnimation(progress);
  }, [trigger, progress, motion]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.8 * (1 - progress.value),
    transform: [{ scale: reduced ? 1 : 0.6 + 2 * progress.value }],
  }));
  return (
    <Animated.View
      testID="tv-tap-ripple"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: props.x - RING / 2,
          top: props.y - RING / 2,
          width: RING,
          height: RING,
          borderRadius: theme.radius.pill,
          borderColor: theme.color.accent,
          borderWidth: 2,
        },
        style,
      ]}
    />
  );
}
