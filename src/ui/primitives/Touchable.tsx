import type { ReactElement, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '@/theme';

export interface TouchableProps {
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'checkbox' | 'togglebutton' | 'switch';
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean;
  busy?: boolean;
  expanded?: boolean;
  children: ReactNode;
}

export function Touchable(props: TouchableProps): ReactElement {
  const theme = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      disabled={props.disabled}
      accessibilityLabel={props.accessibilityLabel}
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
        opacity: props.disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      {props.children}
    </Pressable>
  );
}
