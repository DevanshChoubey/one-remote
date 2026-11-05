import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Icon } from '../Icon';
import { Box } from '../primitives';

export interface IrPhoneProps {
  /** An IR test is being sent: three rings rise from the phone's top edge. */
  firing: boolean;
}

const RING_STAGGER_MS = 300;
const RING_MS = 900;

function Ring(props: { index: number; firing: boolean }): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const progress = useSharedValue(0);
  const on = useSharedValue(0);
  const { firing, index } = props;
  const animate = firing && !motion.reduced;
  const { easing } = motion.timing('base');

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    on.value = animate ? 1 : 0;
    if (animate) {
      progress.value = withDelay(
        index * RING_STAGGER_MS,
        withRepeat(withTiming(1, { duration: RING_MS, easing }), -1, false),
      );
    }
    return () => cancelAnimation(progress);
  }, [animate, index, easing, progress, on]);

  const style = useAnimatedStyle(() => ({
    opacity: on.value === 0 ? 0 : 0.8 * (1 - progress.value),
    transform: [{ translateY: 24 - 58 * progress.value }, { scale: 0.5 + 2.5 * progress.value }],
  }));

  return (
    <Animated.View
      testID={`ir-ring-${index}`}
      style={[
        {
          position: 'absolute',
          left: 53,
          top: 40,
          width: 14,
          height: 14,
          borderRadius: theme.radius.pill,
          borderWidth: 2,
          borderColor: theme.color.accent,
          opacity: 0,
        },
        style,
      ]}
    />
  );
}

/** A phone aimed at the appliance; while an IR test is firing, rings rise off its top edge. */
export function IrPhone(props: IrPhoneProps): ReactElement {
  return (
    <Box w={120} h={160} align="center" accessibilityRole="image">
      <Box float={{ left: 28, top: 70 }}>
        <Icon name="ir" size={64} />
      </Box>
      {[0, 1, 2].map((i) => (
        <Ring key={i} index={i} firing={props.firing} />
      ))}
    </Box>
  );
}
