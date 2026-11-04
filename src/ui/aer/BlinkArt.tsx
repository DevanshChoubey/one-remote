import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { Icon } from '../Icon';
import { Box } from '../primitives';

export interface BlinkArtProps {
  /** The drawn light blinks with the real one; off it rests grey. */
  on: boolean;
}

const SIZE = 112;
const LED = 10;
const GLOW = 22;
const LED_TOP = 38;
const BLINK_MS = 700;
const DIM = 0.25;

/** The air freshener with its light (mock `.blinkart`): the LED blinks every 700 ms while `on`; still under reduced motion. Decorative. */
export function BlinkArt(props: BlinkArtProps): ReactElement {
  const motion = useMotion();
  const level = useSharedValue(1);
  const animate = props.on && !motion.reduced;
  useEffect(() => {
    cancelAnimation(level);
    level.value = 1;
    if (animate) {
      level.value = withRepeat(
        withTiming(DIM, { duration: BLINK_MS, easing: motion.ease.standard }),
        -1,
        true,
      );
    }
    return () => cancelAnimation(level);
  }, [animate, level, motion.ease.standard]);
  const style = useAnimatedStyle(() => ({ opacity: level.value }));
  return (
    <Box align="center" py={2}>
      <Box
        w={SIZE}
        h={SIZE}
        radius="art"
        bg="surface"
        border="line"
        shadow="card"
        align="center"
        justify="center"
        testID={props.on ? 'blink-art-on' : 'blink-art-off'}
      >
        <Icon name="aer" size={56} strokeWidth={1.7} color="ink" />
        <Animated.View
          testID="blink-led"
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: LED_TOP + LED / 2 - GLOW / 2,
              left: SIZE / 2 - GLOW / 2,
              width: GLOW,
              height: GLOW,
              alignItems: 'center',
              justifyContent: 'center',
            },
            props.on ? style : null,
          ]}
        >
          {props.on ? (
            <Box
              w={GLOW}
              h={GLOW}
              radius="pill"
              bg="accent"
              opacity={0.22}
              float={{ top: 0, left: 0 }}
            />
          ) : null}
          <Box w={LED} h={LED} radius="pill" bg={props.on ? 'accent' : 'line'} />
        </Animated.View>
      </Box>
    </Box>
  );
}
