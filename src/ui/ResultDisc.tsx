import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useMotion, useTheme } from '@/theme';
import { Icon } from './Icon';
import { AnimatedBox } from './primitives/AnimatedBox';

export interface ResultDiscProps {
  kind: 'ok' | 'bad';
  label: string;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7.5';
const CHECK_LENGTH = 21;
const DRAW_MS = 420;
const DRAW_DELAY_MS = 140;
const POP_FROM = 0.7;

function Check(props: { size: number }): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const drawn = useSharedValue(motion.reduced ? 1 : 0);
  const reduced = motion.reduced;
  useEffect(() => {
    cancelAnimation(drawn);
    if (reduced) {
      drawn.value = 1;
      return undefined;
    }
    drawn.value = 0;
    drawn.value = withDelay(
      DRAW_DELAY_MS,
      withTiming(1, { duration: DRAW_MS, easing: motion.ease.standard }),
    );
    return () => cancelAnimation(drawn);
  }, [reduced, drawn, motion.ease.standard]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - drawn.value),
  }));
  return (
    <Svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no"
    >
      <AnimatedPath
        d={CHECK_PATH}
        stroke={theme.color.okInk}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={CHECK_LENGTH}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

/** A 96 px result disc: it pops in (reduced: fades in); the check draws itself. */
export function ResultDisc(props: ResultDiscProps): ReactElement {
  const motion = useMotion();
  const ok = props.kind === 'ok';
  const pop = useSharedValue(0);
  const { duration, easing } = motion.timing('slow', 'spring');
  const reduced = motion.reduced;
  useEffect(() => {
    cancelAnimation(pop);
    pop.value = 0;
    pop.value = withTiming(1, reduced ? { duration } : { duration, easing });
    return () => cancelAnimation(pop);
  }, [reduced, duration, easing, pop]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: reduced ? [] : [{ scale: POP_FROM + (1 - POP_FROM) * pop.value }],
  }));
  return (
    <AnimatedBox
      w={96}
      h={96}
      radius="pill"
      bg={ok ? 'okSoft' : 'dangerSoft'}
      align="center"
      justify="center"
      accessibilityLabel={props.label}
      accessibilityRole="image"
      animatedStyle={animatedStyle}
    >
      {ok ? <Check size={52} /> : <Icon name="alert" size={44} color="dangerInk" />}
    </AnimatedBox>
  );
}
