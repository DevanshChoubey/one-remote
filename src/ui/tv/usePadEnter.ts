import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { useMotion } from '@/theme';

/** The pad swap: the pad fades in and settles from .94 (a fade only when reduced). */
export function usePadEnter(): AnimatedStyle<ViewStyle> {
  const motion = useMotion();
  const entered = useSharedValue(0);
  useEffect(() => {
    entered.value = withTiming(1, motion.timing('base'));
  }, [entered, motion]);
  return useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ scale: motion.reduced ? 1 : 0.94 + 0.06 * entered.value }],
  }));
}
