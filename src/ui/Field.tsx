import { useEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/theme';
import { ErrorLine } from './ErrorLine';
import { Box, Column, Input, Row, Txt } from './primitives';
import type { InputProps } from './primitives';

export interface FieldProps extends Omit<InputProps, 'accessibilityLabel'> {
  label: string;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  error?: string | null;
  helper?: string;
  /** Bump to shake the field once (260 ms; none under reduced motion). */
  shakeKey?: number;
  /**
   * A small button beside the input (Save name, Add room), centred on the input as the mock's
   * `.row`; the label stays above both.
   */
  trailing?: ReactNode;
}

/** A labelled input with an optional helper line and an announced error. */
export function Field(props: FieldProps): ReactElement {
  const { label, error, helper, shakeKey, accessibilityLabel, trailing, ...input } = props;
  const motion = useMotion();
  const shake = useSharedValue(0);
  // Not on mount, whatever the first key is: only a change of the key shakes.
  const lastKey = useRef(shakeKey);
  useEffect(() => {
    if (lastKey.current === shakeKey) return;
    lastKey.current = shakeKey;
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
  const box = (
    <Input {...input} accessibilityLabel={accessibilityLabel ?? label} invalid={!!error} />
  );
  // Mock `.field.shake`: the label, the input and the error line move together.
  return (
    <Animated.View testID="field-shake" style={shaking}>
      <Column gap={2}>
        {/* The mock's label sits 6 px above the input (4 in from the edge): the column gap is 8. */}
        <Animated.View style={{ marginBottom: -2, marginLeft: 4 }}>
          <Txt variant="captionBold" color="ink2">
            {label}
          </Txt>
        </Animated.View>
        {trailing ? (
          <Row gap={2} align="center" testID="field-row">
            <Box flex={1}>{box}</Box>
            {trailing}
          </Row>
        ) : (
          box
        )}
        {error ? (
          <ErrorLine text={error} />
        ) : helper ? (
          <Txt variant="caption" color="ink2">
            {helper}
          </Txt>
        ) : null}
      </Column>
    </Animated.View>
  );
}
