import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { AnimatedBox, Box, Input, Row, Txt } from '../primitives';

export interface OtpCellsProps {
  value: string;
  length: number;
  invalid: boolean;
  onChange: (v: string) => void;
  /** Names the one hidden input that takes the typing. */
  accessibilityLabel: string;
  onSubmitEditing?: () => void;
  /** Bump on every refused code to shake again while the cells stay invalid. */
  shakeKey?: number;
}

const CELL_W = 48;
const CELL_H = 60;

/** A code shown as separate cells, typed into one hidden input. */
export function OtpCells(props: OtpCellsProps): ReactElement {
  const motion = useMotion();
  const theme = useTheme();
  const shift = useSharedValue(0);
  useEffect(() => {
    if (!props.invalid || motion.reduced) return;
    const step = motion.duration.base / 4;
    shift.value = withSequence(
      withTiming(-6, { duration: step }),
      withTiming(5, { duration: step }),
      withTiming(-3, { duration: step }),
      withTiming(0, { duration: step }),
    );
  }, [props.invalid, props.shakeKey, motion.reduced, motion.duration.base, shift]);
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  const chars = props.value.toUpperCase().split('');
  const current = props.invalid ? -1 : Math.min(chars.length, props.length - 1);
  return (
    <AnimatedBox animatedStyle={shake} testID="otp-cells">
      <Row gap={2} justify="center">
        {Array.from({ length: props.length }, (_, i) => {
          const ring = props.invalid ? 'danger' : i === current ? 'accent' : 'line';
          const inset = props.invalid || i === current ? 2 : 1;
          return (
            // One 14 px cell whose ring (1 px line, 2 px accent or danger) is drawn inside its edge.
            <Animated.View
              key={i}
              testID={`otp-cell-${i}`}
              style={{
                width: CELL_W,
                height: CELL_H,
                borderRadius: theme.radius.tile,
                borderWidth: inset,
                borderColor: theme.color[ring],
                backgroundColor: theme.color.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt variant="title" size="otp" tabular>
                {chars[i] ?? ''}
              </Txt>
            </Animated.View>
          );
        })}
      </Row>
      <Box float={{ top: 0, left: 0, right: 0, bottom: 0 }} opacity={0}>
        <Input
          value={props.value}
          onChangeText={props.onChange}
          accessibilityLabel={props.accessibilityLabel}
          autoCapitalize="characters"
          maxLength={props.length}
          invalid={props.invalid}
          onSubmitEditing={props.onSubmitEditing}
          testID="otp-input"
        />
      </Box>
    </AnimatedBox>
  );
}
