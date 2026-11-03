import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { ErrorLine } from './ErrorLine';
import { Column, Input, Txt } from './primitives';
import type { InputProps } from './primitives';

export interface FieldProps extends Omit<InputProps, 'accessibilityLabel'> {
  label: string;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  error?: string | null;
  helper?: string;
  /** Bump to shake the field once (260 ms; none under reduced motion). */
  shakeKey?: number;
}

/** A labelled input with an optional helper line and an announced error. */
export function Field(props: FieldProps): ReactElement {
  const { label, error, helper, shakeKey, accessibilityLabel, ...input } = props;
  const motion = useMotion();
  const shake = useSharedValue(0);
  useEffect(() => {
    // Not on mount: only a change of the key shakes.
    if (!shakeKey || motion.reduced) return;
    const step = motion.duration.base / 4;
    const t = { duration: step, easing: motion.ease.standard };
    shake.value = withSequence(
      withTiming(-6, t),
      withTiming(5, t),
      withTiming(-3, t),
      withTiming(0, t),
    );
  }, [shakeKey, shake, motion]);
  const shaking = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  return (
    <Column gap={2}>
      <Txt variant="label" color="ink2">
        {label}
      </Txt>
      <Animated.View testID="field-shake" style={shaking}>
        <Input {...input} accessibilityLabel={accessibilityLabel ?? label} invalid={!!error} />
      </Animated.View>
      {error ? (
        <ErrorLine text={error} />
      ) : helper ? (
        <Txt variant="caption" color="ink2">
          {helper}
        </Txt>
      ) : null}
    </Column>
  );
}
