import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import type { TextStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken } from '@/theme';

export interface TxtProps {
  variant?: 'title' | 'heading' | 'body' | 'bodyBold' | 'caption';
  color?: ColorToken;
  numberOfLines?: number;
  selectable?: boolean;
  children: ReactNode;
}

export function Txt(props: TxtProps): ReactElement {
  const theme = useTheme();
  const variant = props.variant ?? 'body';
  const fontByVariant = {
    title: theme.font.heading,
    heading: theme.font.heading,
    body: theme.font.body,
    bodyBold: theme.font.bodyBold,
    caption: theme.font.body,
  } as const;
  const sizeByVariant = {
    title: theme.size.title,
    heading: theme.size.heading,
    body: theme.size.body,
    bodyBold: theme.size.body,
    caption: theme.size.caption,
  } as const;
  const style: TextStyle = {
    ...fontByVariant[variant],
    fontSize: sizeByVariant[variant],
    color: theme.color[props.color ?? 'ink'],
  };
  return (
    <Text
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      style={style}
      numberOfLines={props.numberOfLines}
      selectable={props.selectable}
    >
      {props.children}
    </Text>
  );
}
