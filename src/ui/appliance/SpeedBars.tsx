import { useEffect } from 'react';
import type { ReactElement } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Box, Touchable } from '../primitives';
import { mixColor } from '../primitives/Touchable';
import { Skeleton } from '../Skeleton';

export interface SpeedBarsProps {
  /** 0 when the fan is off; bars 1..value are filled. */
  value: number;
  max: 5;
  onPick: (n: number) => void;
  labelFor: (n: number) => string;
  disabled?: boolean;
}

/** Mock `.speed`: 10 px between the bars, 250 tall. */
const GAP = 10;
const HEIGHT = 250;
/** Mock `.speed button`: 20 px bold number, 14 px above the bottom. */
const LABEL_SIZE = 20;
const LABEL_BOTTOM = 14;
/** Mock `skelFan` `.speed` margin-top. */
const SKELETON_TOP = 20;

/** Five bars of rising height; the picked ones fill from the bottom. */
export function SpeedBars(props: SpeedBarsProps): ReactElement {
  const bars = Array.from({ length: props.max }, (_, i) => i + 1);
  return (
    <Animated.View
      testID="speed-bars"
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: GAP, height: HEIGHT }}
    >
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
    </Animated.View>
  );
}

/** Mock `skelFan`: the same five rising bars as skeletons, 20 px below the hero. */
export function SpeedBarsSkeleton(): ReactElement {
  return (
    <Animated.View
      testID="speed-bars-skeleton"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: GAP,
        height: HEIGHT,
        marginTop: SKELETON_TOP,
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Box key={n} flex={1} h={`${32 + (n - 1) * 17}%`}>
          <Skeleton width="100%" height="100%" radius="md" />
        </Box>
      ))}
    </Animated.View>
  );
}

function Bar(props: { n: number; lit: boolean }): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const fill = useSharedValue(props.lit ? 1 : 0);
  const tint = useSharedValue(props.lit ? 1 : 0);
  useEffect(() => {
    const to = props.lit ? 1 : 0;
    fill.value = withTiming(to, motion.timing('base'));
    tint.value = motion.reduced ? to : withTiming(to, motion.timing('fast'));
  }, [props.lit, fill, tint, motion]);
  const reduced = motion.reduced;
  const style = useAnimatedStyle(() => ({
    opacity: reduced ? fill.value : 1,
    transform: [{ scaleY: reduced ? 1 : fill.value }],
  }));
  const off = theme.color.ink2;
  const on = theme.color.accentInk;
  const labelColour = useAnimatedStyle(() => ({ color: mixColor(tint.value, off, on) }), [off, on]);
  return (
    <Animated.View
      style={{
        flex: 1,
        overflow: 'hidden',
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.surface,
      }}
    >
      {/* The mock's inset ring: under the fill, and gone on a lit bar (`.lit` box-shadow none). */}
      {props.lit ? null : (
        <Animated.View
          testID={`speed-ring-${props.n}`}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.color.line,
          }}
        />
      )}
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
      <Animated.View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: LABEL_BOTTOM,
        }}
      >
        <Animated.Text
          style={[
            {
              ...theme.font.heading,
              fontSize: LABEL_SIZE,
              lineHeight: Math.round(LABEL_SIZE * 1.3),
            },
            labelColour,
          ]}
          // The number sits in a bar about 57 dp wide with a fixed line height: cap its growth.
          maxFontSizeMultiplier={1.3}
        >
          {String(props.n)}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}
