import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Icon } from '../Icon';
import { Box } from '../primitives';

export interface RadarProps {
  /** Rings ping while the app looks; at rest only the core shows. */
  searching: boolean;
}

const SIZE = 168;
const PING_MS = 2400;
const STAGGER_MS = 800;
const RINGS = [0, 1, 2] as const;

/** One ring: scale .45 to 1.15 and opacity .55 to 0, then again. Gone when it unmounts. */
function Ring(props: { index: number }): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  // 1 is the resting end of the ping (invisible), so a delayed ring waits unseen.
  const progress = useSharedValue(1);
  useEffect(() => {
    progress.value = 1;
    progress.value = withDelay(
      props.index * STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: PING_MS, easing: motion.ease.standard }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, props.index, motion.ease.standard]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - progress.value),
    transform: [{ scale: 0.45 + 0.7 * progress.value }],
  }));
  return (
    <Animated.View
      testID="radar-ping"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: SIZE,
          height: SIZE,
          borderRadius: theme.radius.pill,
          borderWidth: 2,
          borderColor: theme.color.accent,
        },
        style,
      ]}
    />
  );
}

/** The search radar: an accent core with three rings pinging out of it. Decorative. */
export function Radar(props: RadarProps): ReactElement {
  const motion = useMotion();
  const ping = props.searching && !motion.reduced;
  return (
    <Box w={SIZE} h={SIZE} align="center" justify="center" testID="radar">
      {ping ? RINGS.map((i) => <Ring key={i} index={i} />) : null}
      <Box
        w={72}
        h={72}
        radius="pill"
        bg="accent"
        align="center"
        justify="center"
        testID="radar-core"
      >
        <Icon name="tv" size={34} color="accentInk" />
      </Box>
    </Box>
  );
}
