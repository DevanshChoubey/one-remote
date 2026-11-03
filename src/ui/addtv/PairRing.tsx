import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useMotion, useTheme } from '@/theme';
import { Icon } from '../Icon';
import { Box, Txt } from '../primitives';

export interface PairRingProps {
  secondsLeft: number;
  total: number;
  /** Waiting for Allow, paired, or refused. */
  phase: 'wait' | 'ok' | 'bad';
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 132;
const R = 58;
const STROKE = 8;
const CIRCUMFERENCE = 364.4;

/** The pairing countdown: an arc that drains once a second, then a check or an alert. */
export function PairRing(props: PairRingProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const left = props.total > 0 ? Math.min(1, Math.max(0, props.secondsLeft / props.total)) : 0;
  // The arc is full while time is left to give and drains to nothing; done states fill it.
  const target = props.phase === 'wait' ? CIRCUMFERENCE * (1 - left) : 0;
  const offset = useSharedValue(target);
  useEffect(() => {
    if (motion.reduced) {
      cancelAnimation(offset);
      offset.value = target;
      return;
    }
    offset.value = withTiming(target, { duration: 1000, easing: Easing.linear });
    return () => cancelAnimation(offset);
  }, [offset, target, motion.reduced]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  const arc =
    props.phase === 'ok'
      ? theme.color.ok
      : props.phase === 'bad'
        ? theme.color.danger
        : theme.color.accent;
  return (
    <Box w={SIZE} h={SIZE} align="center" justify="center" testID="pair-ring">
      <Box float={{ top: 0, left: 0 }} w={SIZE} h={SIZE}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 132 132" accessible={false}>
          <Circle
            cx={66}
            cy={66}
            r={R}
            stroke={theme.color.line}
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            testID="pair-ring-arc"
            cx={66}
            cy={66}
            r={R}
            stroke={arc}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            // Starts at 12 o'clock.
            transform="rotate(-90 66 66)"
            animatedProps={animatedProps}
          />
        </Svg>
      </Box>
      {props.phase === 'wait' ? (
        <Txt variant="title" size="ring" tabular>
          {String(props.secondsLeft)}
        </Txt>
      ) : props.phase === 'ok' ? (
        <Icon name="check" size={56} color="ok" strokeWidth={2.4} />
      ) : (
        <Icon name="alert" size={48} color="danger" />
      )}
    </Box>
  );
}
