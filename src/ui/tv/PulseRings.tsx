import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';

const SIZE = 64;

function Ring(props: { progress: SharedValue<number> }): ReactElement {
  const theme = useTheme();
  const { progress } = props;
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - progress.value),
    transform: [{ scale: 1 + 1.4 * progress.value }],
  }));
  return (
    <Animated.View
      testID="mic-pulse"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: SIZE,
          height: SIZE,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.accent,
        },
        style,
      ]}
    />
  );
}

/** Two accent rings pulsing out of a 64 px button, staggered over `ambient`; none when reduced. */
export function PulseRings(props: { active: boolean }): ReactElement | null {
  const motion = useMotion();
  const first = useSharedValue(0);
  const second = useSharedValue(0);
  const running = props.active && !motion.reduced;
  const { ambient } = motion.duration;
  const easing = motion.ease.standard;
  useEffect(() => {
    if (!running) return;
    first.value = 0;
    second.value = 0;
    first.value = withRepeat(withTiming(1, { duration: ambient, easing }), -1, false);
    second.value = withDelay(
      ambient / 2,
      withRepeat(withTiming(1, { duration: ambient, easing }), -1, false),
    );
    return () => {
      cancelAnimation(first);
      cancelAnimation(second);
    };
  }, [running, ambient, easing, first, second]);
  if (!running) return null;
  return (
    <>
      <Ring progress={first} />
      <Ring progress={second} />
    </>
  );
}
