import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** A "sent" ring over a round key: 1 to 1.35 as it fades, over `base`, each time `trigger` changes. */
export function SentRing(props: { trigger: number }): ReactElement {
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
    transform: [{ scale: reduced ? 1 : 1 + 0.35 * progress.value }],
  }));
  return (
    <Animated.View
      testID="tv-sent-ring"
      pointerEvents="none"
      style={[
        FILL,
        { borderRadius: theme.radius.pill, borderColor: theme.color.accent, borderWidth: 2 },
        style,
      ]}
    />
  );
}
