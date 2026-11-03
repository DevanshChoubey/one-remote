import { useState } from 'react';
import type { ReactElement } from 'react';
import { TextInput } from 'react-native';
import { useTheme } from '@/theme';

export interface InputProps {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  onSubmitEditing?: () => void;
  accessibilityLabel: string;
  autoCapitalize?: 'none' | 'characters';
  maxLength?: number;
  invalid?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

export function Input(props: InputProps): ReactElement {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const ring = props.invalid ? 'danger' : focused ? 'accent' : 'line';
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={theme.color.ink2}
      onSubmitEditing={props.onSubmitEditing}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={props.accessibilityLabel}
      autoCapitalize={props.autoCapitalize}
      maxLength={props.maxLength}
      keyboardType={props.keyboardType}
      editable={props.editable}
      autoFocus={props.autoFocus}
      testID={props.testID}
      style={{
        height: theme.touch.key,
        paddingHorizontal: theme.space(4),
        borderRadius: theme.radius.md,
        borderWidth: props.invalid || focused ? 2 : 1,
        borderColor: theme.color[ring],
        backgroundColor: theme.color.surface,
        color: theme.color.ink,
        ...theme.font.body,
        fontSize: theme.size.body,
      }}
    />
  );
}
