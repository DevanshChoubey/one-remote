import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import type { RadiusToken } from '@/theme';
import { AnimatedBox } from './primitives/AnimatedBox';
import { Box, Row } from './primitives';

export interface SkeletonProps {
  width?: number | `${number}%`;
  /** A number of points, or a share of the parent to fill it. */
  height: number | `${number}%`;
  radius?: RadiusToken;
  /** For bars on a card: the `line` colour at 0.7 opacity, as in the mock. */
  onCard?: boolean;
}

const SWEEP_MS = 1500;
const BLINK_MS = 1600;
const BAND_SHARE = 0.6;
const BAND_OPACITY = 0.7;
const CARD_OPACITY = 0.7;

/** A placeholder bar with a light band sweeping across it; reduced motion: a slow blink. */
export function Skeleton(props: SkeletonProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const reduced = motion.reduced;
  const [barWidth, setBarWidth] = useState(0);
  const sweep = useSharedValue(0);
  const blink = useSharedValue(1);
  const ease = motion.ease.standard;
  useEffect(() => {
    cancelAnimation(sweep);
    cancelAnimation(blink);
    sweep.value = 0;
    blink.value = 1;
    if (reduced) {
      const half = { duration: BLINK_MS / 2, easing: ease };
      blink.value = withRepeat(withSequence(withTiming(0.5, half), withTiming(1, half)), -1);
    } else {
      sweep.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: ease }), -1);
    }
    return () => {
      cancelAnimation(sweep);
      cancelAnimation(blink);
    };
  }, [reduced, ease, sweep, blink]);
  const bandWidth = barWidth * BAND_SHARE;
  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -bandWidth + sweep.value * (barWidth + bandWidth) }],
  }));
  const rest = props.onCard ? CARD_OPACITY : 1;
  const barStyle = useAnimatedStyle(() => ({ opacity: rest * (reduced ? blink.value : 1) }));
  const onLayout = (e: LayoutChangeEvent): void => setBarWidth(e.nativeEvent.layout.width);
  return (
    <AnimatedBox
      bg={props.onCard ? 'line' : 'surface2'}
      w={props.width}
      h={props.height}
      radius={props.radius ?? 'sm'}
      animatedStyle={barStyle}
    >
      <Animated.View
        onLayout={onLayout}
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          overflow: 'hidden',
          borderRadius: theme.radius[props.radius ?? 'sm'],
        }}
      >
        {reduced ? null : (
          <AnimatedBox
            testID="skeleton-band"
            bg="surface"
            h="100%"
            w={bandWidth}
            opacity={BAND_OPACITY}
            animatedStyle={bandStyle}
          />
        )}
      </Animated.View>
    </AnimatedBox>
  );
}

/**
 * A device card while it loads (mock `SkelCard`): a shimmering 44 px tile block, a 16 and a 12 px
 * bar (58% and 36% wide) and a switch pill, all in `line` at 0.7, at the card's 76 px height.
 */
export function SkelCard(props: { testID?: string }): ReactElement {
  return (
    <Box
      testID={props.testID}
      bg="surface"
      border="line"
      radius="md"
      shadow="card"
      p={4}
      minH={76}
      justify="center"
    >
      <Row gap={3} align="center">
        <Skeleton width={44} height={44} radius="tile" onCard />
        <Box flex={1} gap={2}>
          <Skeleton width="58%" height={16} onCard />
          <Skeleton width="36%" height={12} onCard />
        </Box>
        <Skeleton width={52} height={32} radius="pill" onCard />
      </Row>
    </Box>
  );
}
