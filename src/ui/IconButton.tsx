import type { ReactElement } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { AnimatedBox, Box, Touchable } from './primitives';
import { Spinner } from './Spinner';
import { mixColor } from './primitives/Touchable';

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** `power` draws the icon in the danger ink; `accent` is a soft accent disc with an accent icon. */
  tone?: 'ink' | 'power' | 'accent';
  /** Shows a spinner in place of the icon and ignores presses (reports `busy`). */
  busy?: boolean;
  /** No disc or ring: just the icon (sheet close, bar actions on a bare background). */
  flat?: boolean;
  expanded?: boolean;
  /** On/off state (power buttons): the button becomes a switch that reports `checked`. */
  checked?: boolean;
  disabled?: boolean;
  testID?: string;
}

function noop(): void {}

/** A 48 px round icon control. */
export function IconButton(props: IconButtonProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  // A flat button has no fill: its press tint is the pressed colour at alpha 0 fading in.
  const press = useSharedValue(0);
  const pressed = theme.color.surface2;
  // The same colour at alpha 0 (`#rrggbb00`), so the fade has no dark midpoint.
  const clear = `${pressed}00`;
  const tint = useAnimatedStyle(
    () => ({ backgroundColor: mixColor(press.value, clear, pressed) }),
    [clear, pressed],
  );
  const flat = !!props.flat;
  const accent = props.tone === 'accent';
  return (
    <Touchable
      onPress={props.busy ? noop : props.onPress}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      expanded={props.expanded}
      checked={props.checked}
      busy={props.busy ? true : undefined}
      accessibilityRole={props.checked === undefined ? 'button' : 'switch'}
      testID={props.testID}
      radius="pill"
      bg={flat ? undefined : accent ? 'accentSoft' : 'surface'}
      border={flat || accent ? undefined : 'line'}
      pressedBg={flat ? undefined : accent ? 'accentSoft' : 'surface2'}
      onPressIn={() => {
        press.set(withTiming(1, motion.timing('instant')));
      }}
      onPressOut={() => {
        press.set(withTiming(0, motion.timing('fast')));
      }}
      pressScale={0.92}
      disabledOpacity={0.4}
    >
      <Box w={48} h={48} align="center" justify="center">
        {flat ? (
          <AnimatedBox
            float={{ top: 0, right: 0, bottom: 0, left: 0 }}
            radius="pill"
            pointerEvents="none"
            testID="icon-button-tint"
            animatedStyle={tint}
          />
        ) : null}
        {props.busy ? (
          <Box testID={props.testID ? `${props.testID}-spinner` : 'icon-button-spinner'}>
            <Spinner color={accent ? 'accent' : 'ink'} />
          </Box>
        ) : (
          <Icon
            name={props.icon}
            color={props.tone === 'power' ? 'dangerInk' : accent ? 'accent' : 'ink'}
          />
        )}
      </Box>
    </Touchable>
  );
}
