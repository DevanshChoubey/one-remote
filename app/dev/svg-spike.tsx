import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useEffect } from 'react';
import { Box, Txt } from '@/ui';
import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const CIRCUMFERENCE = 364.4;

/** Proves react-native-svg and Reanimated's useAnimatedProps work together on this SDK. */
export function SvgSpike(): ReactElement {
  const tokens = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(CIRCUMFERENCE, { duration: 1500, easing: Easing.linear }),
      -1,
    );
  }, [progress]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: progress.value }));
  return (
    <Box align="center" justify="center" flex={1}>
      <Svg width={132} height={132} viewBox="0 0 132 132">
        <Circle cx={66} cy={66} r={58} stroke={tokens.color.line} strokeWidth={8} fill="none" />
        <AnimatedCircle
          testID="svg-spike-arc"
          cx={66}
          cy={66}
          r={58}
          stroke={tokens.color.accent}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={animatedProps}
        />
      </Svg>
      <Txt>svg + reanimated spike</Txt>
    </Box>
  );
}

export default function SvgSpikeRoute(): ReactElement {
  if (!__DEV__) return <Redirect href="/" />;
  return <SvgSpike />;
}
