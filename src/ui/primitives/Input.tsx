import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { TextInput } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { mixColor } from './Touchable';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface InputProps {
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  onSubmitEditing?: () => void;
  accessibilityLabel: string;
  autoCapitalize?: 'none' | 'characters';
  maxLength?: number;
  invalid?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'phone-pad';
  /** A password: hidden, never autocorrected or suggested. */
  secure?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  testID?: string;
}

export function Input(props: InputProps): ReactElement {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const motion = useMotion();
  // 0..1 progress of the focus ring and of the invalid ring; the fade is `fast`.
  const focus = useSharedValue(0);
  const invalid = useSharedValue(props.invalid ? 1 : 0);
  useEffect(() => {
    const to = focused ? 1 : 0;
    focus.value = motion.reduced ? to : withTiming(to, motion.timing('fast'));
  }, [focused, focus, motion]);
  useEffect(() => {
    const to = props.invalid ? 1 : 0;
    invalid.value = motion.reduced ? to : withTiming(to, motion.timing('fast'));
  }, [props.invalid, invalid, motion]);
  const line = theme.color.line;
  const accent = theme.color.accent;
  const danger = theme.color.danger;
  const ring = useAnimatedStyle(
    () => ({
      borderColor: mixColor(invalid.value, mixColor(focus.value, line, accent), danger),
      borderWidth: Math.max(focus.value, invalid.value) > 0 ? 2 : 1,
    }),
    [line, accent, danger],
  );
  return (
    <AnimatedTextInput
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
      secureTextEntry={props.secure}
      autoCorrect={props.secure ? false : undefined}
      textContentType={props.secure ? 'password' : undefined}
      autoComplete={props.secure ? 'password' : undefined}
      editable={props.editable}
      autoFocus={props.autoFocus}
      testID={props.testID}
      style={[
        {
          minHeight: theme.touch.key,
          paddingHorizontal: theme.space(4),
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.surface,
          color: theme.color.ink,
          ...theme.font.body,
          fontSize: theme.size.body,
        },
        ring,
      ]}
    />
  );
}
