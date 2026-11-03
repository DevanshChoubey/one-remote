import type { ReactElement } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import type { ColorToken } from '@/theme';
import { useMotion, useTheme } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { AnimatedBox, Box, Row, Touchable } from './primitives';
import { mixColor } from './primitives/Touchable';

export type ChipState = 'neutral' | 'selected';

export interface ChipProps {
  label: string;
  state: ChipState;
  onToggle?: () => void;
  disabled?: boolean;
  icon?: IconName;
  /** Makes the chip a plain button (role button) instead of a toggle; `onToggle` wins if both are set. */
  onPress?: () => void;
  /** What a press does, for the screen reader. */
  accessibilityHint?: string;
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
  // The label and icon colours follow the fill: same progress, same duration.
  const offText = theme.color[off.text];
  const litText = theme.color[lit.text];
  const labelColour = useAnimatedStyle(
    () => ({ color: mixColor(on.value, offText, litText) }),
    [offText, litText],
  );
  const offIcon = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const litIcon = useAnimatedStyle(() => ({ opacity: on.value }));
  const row = (
    <Row gap={2} align="center" justify="center" px={4} minH={48}>
      {props.icon ? (
        <Box w={18} h={18}>
          <AnimatedBox animatedStyle={offIcon}>
            <Icon name={props.icon} size={18} color={off.text} />
          </AnimatedBox>
          <AnimatedBox float={{ top: 0, left: 0 }} animatedStyle={litIcon}>
            <Icon name={props.icon} size={18} color={lit.text} />
          </AnimatedBox>
        </Box>
      ) : null}
      <Animated.Text
        style={[
          {
            ...theme.font.heading,
            fontSize: theme.size.label,
            lineHeight: theme.lineHeight.label,
          },
          labelColour,
        ]}
      >
        {props.label}
      </Animated.Text>
    </Row>
  );
  const press = props.onToggle ?? props.onPress;
  if (!press) {
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
  const toggle = props.onToggle !== undefined;
  return (
    <Touchable
      onPress={press}
      disabled={props.disabled}
      selected={toggle ? selected : undefined}
      accessibilityRole={toggle ? 'togglebutton' : 'button'}
      accessibilityHint={props.accessibilityHint}
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
