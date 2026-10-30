import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken, RadiusToken, ShadowToken, SpaceStep } from '@/theme';

export interface BoxProps {
  p?: SpaceStep;
  px?: SpaceStep;
  py?: SpaceStep;
  m?: SpaceStep;
  gap?: SpaceStep;
  bg?: ColorToken;
  border?: ColorToken;
  radius?: RadiusToken;
  shadow?: ShadowToken;
  flex?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  direction?: 'row' | 'column';
  wrap?: boolean;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  selected?: boolean;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
} as const;
const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
} as const;

export function Box(props: BoxProps): ReactElement {
  const theme = useTheme();
  const style: Mutable<ViewStyle> = {};
  if (props.direction) style.flexDirection = props.direction;
  if (props.p !== undefined) style.padding = theme.space(props.p);
  if (props.px !== undefined) style.paddingHorizontal = theme.space(props.px);
  if (props.py !== undefined) style.paddingVertical = theme.space(props.py);
  if (props.m !== undefined) style.margin = theme.space(props.m);
  if (props.gap !== undefined) style.gap = theme.space(props.gap);
  if (props.bg) style.backgroundColor = theme.color[props.bg];
  if (props.border) {
    style.borderColor = theme.color[props.border];
    style.borderWidth = 1;
  }
  if (props.radius) style.borderRadius = theme.radius[props.radius];
  if (props.shadow) Object.assign(style, theme.shadow[props.shadow]);
  if (props.wrap) style.flexWrap = 'wrap';
  if (props.flex !== undefined) style.flex = props.flex;
  if (props.align) style.alignItems = ALIGN[props.align];
  if (props.justify) style.justifyContent = JUSTIFY[props.justify];
  return (
    <View
      style={style}
      testID={props.testID}
      accessible={props.accessibilityLabel ? true : undefined}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={props.selected === undefined ? undefined : { selected: props.selected }}
    >
      {props.children}
    </View>
  );
}
