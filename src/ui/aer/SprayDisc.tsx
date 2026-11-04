import { useEffect } from 'react';
import type { ReactElement } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';
import { AnimatedBox, Box, Touchable, Txt } from '../primitives';

export interface SprayDiscProps {
  onPress: () => void;
  spraying: boolean;
  disabled: boolean;
  /** "Spray now", or "Spraying…" while it sprays. */
  label: string;
}

const SIZE = 136;
/** Mock `@keyframes mist`: opacity .35 to 0 and scale 1 to 1.5. */
const MIST_OPACITY = 0.35;
const MIST_SCALE = 0.5;
const PRESSED_SCALE = 0.94;

function Mist(props: { progress: SharedValue<number> }): ReactElement {
  const { progress } = props;
  const style = useAnimatedStyle(() => ({
    opacity: MIST_OPACITY * (1 - progress.value),
    transform: [{ scale: 1 + MIST_SCALE * progress.value }],
  }));
  return (
    <AnimatedBox
      testID="spray-mist"
      pointerEvents="none"
      bg="accent"
      radius="pill"
      w={SIZE}
      h={SIZE}
      float={{ top: 0, left: 0 }}
      animatedStyle={style}
    />
  );
}

/** Mock `.spraywrap` and `.spraybtn`: a 136 px accent disc; while it sprays two mist rings leave it. */
export function SprayDisc(props: SprayDiscProps): ReactElement {
  const motion = useMotion();
  const first = useSharedValue(0);
  const second = useSharedValue(0);
  const misting = props.spraying && !motion.reduced;
  const { ambient } = motion.duration;
  const easing = motion.ease.standard;
  useEffect(() => {
    if (!misting) return;
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
  }, [misting, ambient, easing, first, second]);
  return (
    <Box w={SIZE} h={SIZE} align="center" justify="center">
      {misting ? (
        <>
          <Mist progress={first} />
          <Mist progress={second} />
        </>
      ) : null}
      <Touchable
        onPress={props.onPress}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        disabled={props.disabled || props.spraying}
        noDim={props.spraying && !props.disabled}
        pressScale={PRESSED_SCALE}
        pressedBg="accentPressed"
        bg="accent"
        radius="pill"
        testID="aer-spray"
      >
        <Box w={SIZE} h={SIZE} align="center" justify="center" gap={1}>
          {props.spraying ? (
            <Spinner size="lg" color="accentInk" />
          ) : (
            <Icon name="spray" size={40} color="accentInk" />
          )}
          <Txt variant="bodyBold" color="accentInk">
            {props.label}
          </Txt>
        </Box>
      </Touchable>
    </Box>
  );
}
