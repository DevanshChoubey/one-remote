import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import type { TextStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken } from '@/theme';

export interface TxtProps {
  variant?: 'title' | 'heading' | 'body' | 'bodyBold' | 'caption' | 'display' | 'label';
  color?: ColorToken;
  numberOfLines?: number;
  selectable?: boolean;
  /** Announces the text when it appears (status and error messages). */
  live?: boolean;
  /** Equal-width digits (counters, temperatures). Always on for the display variant. */
  tabular?: boolean;
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
    display: theme.font.heading,
    label: theme.font.heading,
  } as const;
  const sizeByVariant = {
    title: theme.size.title,
    heading: theme.size.heading,
    body: theme.size.body,
    bodyBold: theme.size.body,
    caption: theme.size.caption,
    display: theme.size.display,
    label: theme.size.label,
  } as const;
  const lineByVariant = {
    title: theme.lineHeight.title,
    heading: theme.lineHeight.heading,
    body: theme.lineHeight.body,
    bodyBold: theme.lineHeight.body,
    caption: theme.lineHeight.caption,
    display: theme.lineHeight.display,
    label: theme.lineHeight.label,
  } as const;
  const style: TextStyle = {
    ...fontByVariant[variant],
    fontSize: sizeByVariant[variant],
    lineHeight: lineByVariant[variant],
    color: theme.color[props.color ?? 'ink'],
    ...(variant === 'title' ? { letterSpacing: theme.tracking.title } : null),
    ...(variant === 'display' ? { letterSpacing: theme.tracking.display } : null),
    ...(props.tabular || variant === 'display' ? { fontVariant: ['tabular-nums' as const] } : null),
  };
  return (
    <Text
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      style={style}
      numberOfLines={props.numberOfLines}
      selectable={props.selectable}
      accessibilityLiveRegion={props.live ? 'polite' : undefined}
    >
      {props.children}
    </Text>
  );
}
