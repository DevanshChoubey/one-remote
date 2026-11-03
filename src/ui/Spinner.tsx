import type { ReactElement } from 'react';
import { ActivityIndicator } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken } from '@/theme';

export interface SpinnerProps {
  size?: 'sm' | 'lg';
  color?: ColorToken;
}

export function Spinner(props: SpinnerProps): ReactElement {
  const theme = useTheme();
  return (
    <ActivityIndicator
      size={props.size === 'lg' ? 'large' : 'small'}
      color={theme.color[props.color ?? 'accent']}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
