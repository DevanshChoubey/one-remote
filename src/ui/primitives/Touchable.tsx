import type { ReactElement, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '@/theme';

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
  /** Looks disabled (0.5 opacity) but still takes presses, e.g. to allow a long press. */
  dimmed?: boolean;
  accessibilityHint?: string;
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
      style={({ pressed }) => ({
        minHeight: theme.touch.min,
        minWidth: theme.touch.min,
        justifyContent: 'center',
        opacity: props.disabled || props.dimmed ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      {props.children}
    </Pressable>
  );
}
