import type { ReactElement } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';

export interface TouchDotProps {
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 0 hidden, 1 shown; the caller animates it. */
  visible: SharedValue<number>;
}

const DOT = 44;
const HALO = 10;
const FULL = DOT + HALO * 2;

/** The mock's halo: the accent at 12 %, so the dot grid shows through it. */
function halo(accent: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent) ? `${accent}1f` : fallback;
}

/** The finger dot: 44 px with a soft halo, following the finger on the UI thread. */
export function TouchDot(props: TouchDotProps): ReactElement {
  const theme = useTheme();
  const { reduced } = useMotion();
  const { x, y, visible } = props;
  const style = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [
      { translateX: x.value - FULL / 2 },
      { translateY: y.value - FULL / 2 },
      { scale: reduced ? 1 : 0.6 + 0.4 * visible.value },
    ],
  }));
  return (
    <Animated.View
      testID="tv-touch-dot"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: FULL,
          height: FULL,
          borderRadius: theme.radius.pill,
          backgroundColor: halo(theme.color.accent, theme.color.accentSoft),
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            width: DOT,
            height: DOT,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.surface,
            borderColor: theme.color.line,
            borderWidth: 1,
          },
          theme.shadow.card,
        ]}
      />
    </Animated.View>
  );
}
