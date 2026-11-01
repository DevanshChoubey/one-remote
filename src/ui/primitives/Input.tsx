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
}

export function Input(props: InputProps): ReactElement {
  const theme = useTheme();
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={theme.color.ink2}
      onSubmitEditing={props.onSubmitEditing}
      accessibilityLabel={props.accessibilityLabel}
      autoCapitalize={props.autoCapitalize}
      maxLength={props.maxLength}
      style={{
        minHeight: theme.touch.min,
        paddingHorizontal: theme.space(4),
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.line,
        backgroundColor: theme.color.surface,
        color: theme.color.ink,
        ...theme.font.body,
        fontSize: theme.size.body,
      }}
    />
  );
}
