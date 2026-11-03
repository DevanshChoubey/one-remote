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
import type { SharedValue } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Box } from '@/ui/primitives';
import type { ColorToken } from '@/theme';

const REST = 4;
const PEAK = 14;
const CYCLE = 700;
const DELAYS = [0, 120, 240, 60];

function Bar(props: { height: SharedValue<number>; color: ColorToken }): ReactElement {
  const theme = useTheme();
  const { height } = props;
  const style = useAnimatedStyle(() => ({ height: height.value }));
  return (
    <Animated.View
      style={[
        { width: 3, borderRadius: theme.radius.pill, backgroundColor: theme.color[props.color] },
        style,
      ]}
    />
  );
}

/** Four bars that bounce while `active`; at rest (or with reduced motion) they stand still. */
export function Equaliser(props: { active: boolean; color?: ColorToken }): ReactElement {
  const { reduced } = useMotion();
  const a = useSharedValue(REST);
  const b = useSharedValue(REST);
  const c = useSharedValue(REST);
  const d = useSharedValue(REST);
  const bars = [a, b, c, d];
  const moving = props.active && !reduced;
  useEffect(() => {
    if (!moving) {
      bars.forEach((v) => {
        cancelAnimation(v);
        v.value = REST;
      });
      return;
    }
    bars.forEach((v, i) => {
      v.value = withDelay(
        DELAYS[i] ?? 0,
        withRepeat(
          withSequence(
            withTiming(PEAK, { duration: CYCLE / 2 }),
            withTiming(REST, { duration: CYCLE / 2 }),
          ),
          -1,
          false,
        ),
      );
    });
    return () => bars.forEach((v) => cancelAnimation(v));
    // The shared values are stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);
  return (
    <Box direction="row" align="center" gap={1} h={PEAK}>
      {bars.map((v, i) => (
        <Bar key={i} height={v} color={props.color ?? 'bg'} />
      ))}
    </Box>
  );
}
