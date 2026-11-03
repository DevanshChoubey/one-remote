import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { Icon } from '../Icon';
import type { IconName } from '../Icon';
import { Box } from '../primitives';

export interface SpinningIconProps {
  name: IconName;
  spinning: boolean;
  /** 1 to 5: one turn takes 2400 / speed ms. */
  speed: number;
}

/** A 112 px art tile whose icon turns while `spinning`; still under reduced motion. */
export function SpinningIcon(props: SpinningIconProps): ReactElement {
  const motion = useMotion();
  const turn = useSharedValue(0);
  const run = props.spinning && !motion.reduced;
  useEffect(() => {
    cancelAnimation(turn);
    if (!run) {
      turn.value = 0;
      return;
    }
    const from = turn.value % 360;
    turn.value = from;
    turn.value = withRepeat(
      withTiming(from + 360, { duration: 2400 / Math.max(props.speed, 1), easing: Easing.linear }),
      -1,
    );
  }, [run, props.speed, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Box
      w={112}
      h={112}
      radius="art"
      bg="surface"
      border="line"
      shadow="card"
      align="center"
      justify="center"
    >
      <Animated.View testID="spinning-icon" style={style}>
        <Icon name={props.name} size={56} strokeWidth={1.7} color="accent" />
      </Animated.View>
    </Box>
  );
}
