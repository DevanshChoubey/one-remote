import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { AnimatedBox } from '@/ui/primitives';

/** The mock's `.fade`: a whole-screen panel fades in over `base` (260 ms) when it appears. */
export function PanelFade(props: { children: ReactNode; testID?: string }): ReactElement {
  const motion = useMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, motion.timing('base'));
    return () => cancelAnimation(shown);
    // The fade plays once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <AnimatedBox flex={1} animatedStyle={style} testID={props.testID}>
      {props.children}
    </AnimatedBox>
  );
}
