import type { ReactElement, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken, RadiusToken } from '@/theme';

export interface TouchableProps {
  onPress: () => void;
  onLongPress?: () => void;
  /** For hold-to-talk: the finger went down / came up. `onPress` still fires on a release. */
  onPressIn?: () => void;
  onPressOut?: () => void;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'checkbox' | 'togglebutton' | 'switch';
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean;
  busy?: boolean;
  expanded?: boolean;
  /** Looks dimmed (0.6, like an off card) but still takes presses, e.g. to allow a long press. */
  dimmed?: boolean;
  accessibilityHint?: string;
  /** Scale while pressed: 0.97 by default, 1 for none. */
  pressScale?: number;
  /** Background tint while pressed; the wrapper draws it. */
  pressedBg?: ColorToken;
  /** The wrapper is the visible surface of buttons, chips and menu rows. */
  bg?: ColorToken;
  border?: ColorToken;
  radius?: RadiusToken;
  /** Stretches to fill its parent (scrims). */
  fill?: boolean;
  alignSelf?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  testID?: string;
  children: ReactNode;
}

export function Touchable(props: TouchableProps): ReactElement {
  const theme = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      onPressIn={props.onPressIn}
      onPressOut={props.onPressOut}
      disabled={props.disabled}
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{
        disabled: props.disabled === true,
        selected: props.selected,
        checked: props.checked,
        busy: props.busy,
        expanded: props.expanded,
      }}
      style={({ pressed }) => {
        const bg = pressed && props.pressedBg ? props.pressedBg : props.bg;
        return {
          minHeight: theme.touch.min,
          minWidth: theme.touch.min,
          justifyContent: 'center',
          opacity: props.disabled ? 0.42 : props.dimmed ? 0.6 : 1,
          ...(bg ? { backgroundColor: theme.color[bg] } : null),
          ...(props.border ? { borderColor: theme.color[props.border], borderWidth: 1 } : null),
          ...(props.radius ? { borderRadius: theme.radius[props.radius] } : null),
          ...(props.fill ? { flex: 1, alignSelf: 'stretch' as const } : null),
          ...(props.alignSelf ? { alignSelf: props.alignSelf } : null),
          ...(pressed ? { transform: [{ scale: props.pressScale ?? 0.97 }] } : null),
        };
      }}
    >
      {props.children}
    </Pressable>
  );
}
