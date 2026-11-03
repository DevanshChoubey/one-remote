import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';
import type { TextStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken, Tokens } from '@/theme';

export interface TxtProps {
  variant?:
    'title' | 'heading' | 'body' | 'bodyBold' | 'caption' | 'captionBold' | 'display' | 'label';
  /** Overrides the variant's font size with a token (line height follows). */
  size?: keyof Tokens['size'];
  /** Overrides the variant's weight: regular 400, semibold 600, bold 700. */
  weight?: 'regular' | 'semibold' | 'bold';
  align?: 'left' | 'center' | 'right';
  underline?: boolean;
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
    captionBold: theme.font.bodyBold,
    display: theme.font.heading,
    label: theme.font.heading,
  } as const;
  const sizeByVariant = {
    title: theme.size.title,
    heading: theme.size.heading,
    body: theme.size.body,
    bodyBold: theme.size.body,
    caption: theme.size.caption,
    captionBold: theme.size.caption,
    display: theme.size.display,
    label: theme.size.label,
  } as const;
  const lineByVariant = {
    title: theme.lineHeight.title,
    heading: theme.lineHeight.heading,
    body: theme.lineHeight.body,
    bodyBold: theme.lineHeight.body,
    caption: theme.lineHeight.caption,
    captionBold: theme.lineHeight.caption,
    display: theme.lineHeight.display,
    label: theme.lineHeight.label,
  } as const;
  const weightFont = {
    regular: theme.font.body,
    semibold: theme.font.semibold,
    bold: theme.font.bodyBold,
  } as const;
  const fontSize = props.size ? theme.size[props.size] : sizeByVariant[variant];
  const style: TextStyle = {
    ...(props.weight ? weightFont[props.weight] : fontByVariant[variant]),
    fontSize,
    lineHeight: props.size ? Math.round(fontSize * 1.3) : lineByVariant[variant],
    ...(props.align ? { textAlign: props.align } : null),
    ...(props.underline ? { textDecorationLine: 'underline' as const } : null),
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
