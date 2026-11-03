import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Box, Row, Touchable, Txt } from '../primitives';

export interface SpeedBarsProps {
  /** 0 when the fan is off; bars 1..value are filled. */
  value: number;
  max: 5;
  onPick: (n: number) => void;
  labelFor: (n: number) => string;
  disabled?: boolean;
}

/** Five bars of rising height; the picked ones fill from the bottom. */
export function SpeedBars(props: SpeedBarsProps): ReactElement {
  const bars = Array.from({ length: props.max }, (_, i) => i + 1);
  return (
    <Row gap={2} align="end" h={250}>
      {bars.map((n) => (
        <Box key={n} flex={1} h={`${32 + (n - 1) * 17}%`}>
          <Touchable
            onPress={() => props.onPick(n)}
            disabled={props.disabled}
            selected={props.value === n}
            accessibilityLabel={props.labelFor(n)}
            radius="md"
            pressScale={0.96}
            fill
          >
            <Bar n={n} lit={n <= props.value} />
          </Touchable>
        </Box>
      ))}
    </Row>
  );
}

function Bar(props: { n: number; lit: boolean }): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const fill = useSharedValue(props.lit ? 1 : 0);
  useEffect(() => {
    fill.value = withTiming(props.lit ? 1 : 0, motion.timing('base'));
  }, [props.lit, fill, motion]);
  const reduced = motion.reduced;
  const style = useAnimatedStyle(() => ({
    opacity: reduced ? fill.value : 1,
    transform: [{ scaleY: reduced ? 1 : fill.value }],
  }));
  return (
    <Animated.View
      style={{
        flex: 1,
        overflow: 'hidden',
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.line,
        backgroundColor: theme.color.surface,
      }}
    >
      <Animated.View
        testID={`speed-fill-${props.n}`}
        style={[
          {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: theme.color.accent,
            transformOrigin: 'bottom',
          },
          style,
        ]}
      />
      <Box flex={1} align="center" justify="end" py={3}>
        <Txt variant="heading" color={props.lit ? 'accentInk' : 'ink2'}>
          {String(props.n)}
        </Txt>
      </Box>
    </Animated.View>
  );
}
