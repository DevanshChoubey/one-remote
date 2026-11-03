import type { ReactElement } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import type { ColorToken } from '@/theme';
import { useMotion, useTheme } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { AnimatedBox, Row, Touchable, Txt } from './primitives';
import { mixColor } from './primitives/Touchable';

export type ChipState = 'neutral' | 'selected';

export interface ChipProps {
  label: string;
  state: ChipState;
  onToggle?: () => void;
  disabled?: boolean;
  icon?: IconName;
}

const LOOK: Record<ChipState, { bg: ColorToken; border: ColorToken; text: ColorToken }> = {
  neutral: { bg: 'surface', border: 'line', text: 'ink' },
  selected: { bg: 'accent', border: 'accent', text: 'accentInk' },
};

const DISABLED_LOOK = { bg: 'surface2', border: 'line', text: 'ink2' } as const;

export function Chip(props: ChipProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const look = props.disabled ? DISABLED_LOOK : LOOK[props.state];
  const selected = props.state === 'selected';
  // Fill and colour fade `fast` when the state changes; a theme change recolours at once.
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const to = selected ? 1 : 0;
    on.value = motion.reduced ? to : withTiming(to, motion.timing('fast'));
  }, [selected, on, motion]);
  const off = props.disabled ? DISABLED_LOOK : LOOK.neutral;
  const lit = props.disabled ? DISABLED_LOOK : LOOK.selected;
  const offBg = theme.color[off.bg];
  const litBg = theme.color[lit.bg];
  const offLine = theme.color[off.border];
  const litLine = theme.color[lit.border];
  const fade = useAnimatedStyle(
    () => ({
      backgroundColor: mixColor(on.value, offBg, litBg),
      borderColor: mixColor(on.value, offLine, litLine),
    }),
    [offBg, litBg, offLine, litLine],
  );
  const row = (
    <Row gap={2} align="center" justify="center" px={4} minH={48}>
      {props.icon ? <Icon name={props.icon} size={18} color={look.text} /> : null}
      <Txt variant="label" color={look.text}>
        {props.label}
      </Txt>
    </Row>
  );
  if (!props.onToggle) {
    return (
      <Animated.View
        accessible
        accessibilityLabel={props.label}
        accessibilityState={{ selected }}
        style={[
          {
            borderWidth: 1,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color[look.bg],
            borderColor: theme.color[look.border],
          },
          fade,
        ]}
      >
        {row}
      </Animated.View>
    );
  }
  return (
    <Touchable
      onPress={props.onToggle}
      disabled={props.disabled}
      selected={selected}
      accessibilityRole="togglebutton"
      accessibilityLabel={props.label}
      radius="pill"
      pressScale={0.95}
    >
      <AnimatedBox border={look.border} radius="pill" animatedStyle={fade}>
        {row}
      </AnimatedBox>
    </Touchable>
  );
}
