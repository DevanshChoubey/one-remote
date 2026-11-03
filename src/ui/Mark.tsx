import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useMotion, useTheme } from '@/theme';
import { AnimatedBox } from './primitives';

export interface MarkProps {
  size?: number;
  /** Draws itself in once, then calls `onDone`. */
  animate?: boolean;
  onDone?: () => void;
  /** "mark" by default. */
  testID?: string;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const RING_LENGTH = 126;
const RING_DELAY = 260;
const RING_DURATION = 700;

/**
 * The app mark: the power ring with its stem on an accent tile. With `animate` the tile scales
 * .7 to 1 over `slow` (spring) and the ring draws over 700 ms after 260 ms (~960 ms in all), then
 * `onDone` is called. Reduced motion: drawn at once, `onDone` straight away.
 */
export function Mark(props: MarkProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const size = props.size ?? 112;
  const glyph = Math.round((size * 64) / 112);
  const instant = !props.animate || motion.reduced;
  const scale = useSharedValue(instant ? 1 : 0.7);
  const draw = useSharedValue(instant ? 1 : 0);
  const { animate, onDone } = props;

  useEffect(() => {
    if (!animate) return undefined;
    if (motion.reduced) {
      scale.value = 1;
      draw.value = 1;
      onDone?.();
      return undefined;
    }
    scale.value = 0.7;
    draw.value = 0;
    scale.value = withTiming(1, motion.timing('slow', 'spring'));
    draw.value = withDelay(
      RING_DELAY,
      withTiming(1, { duration: RING_DURATION, easing: motion.ease.standard }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      }),
    );
    return undefined;
    // Draws once per mount (or when the motion setting changes); a new `onDone` must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, motion.reduced]);

  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_LENGTH * (1 - draw.value),
  }));
  return (
    <AnimatedBox
      w={size}
      h={size}
      radius="art"
      bg="accent"
      shadow="pop"
      align="center"
      justify="center"
      testID={props.testID ?? 'mark'}
      animatedStyle={tileStyle}
    >
      <Svg
        width={glyph}
        height={glyph}
        viewBox="0 0 64 64"
        fill="none"
        stroke={theme.color.accentInk}
        strokeWidth={4}
        strokeLinecap="round"
        accessible={false}
        importantForAccessibility="no"
      >
        <AnimatedPath
          d="M20 15.5a22 22 0 1024 0"
          strokeDasharray={RING_LENGTH}
          animatedProps={ringProps}
        />
        <Path d="M32 6v22" />
      </Svg>
    </AnimatedBox>
  );
}
