import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import type { ColorToken, RadiusToken, ShadowToken, SpaceStep, Tokens } from '@/theme';

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
  /** Fixed width / height in px (round buttons, glyph parts). */
  w?: number | `${number}%`;
  h?: number | `${number}%`;
  minH?: number;
  maxH?: number | `${number}%`;
  opacity?: number;
  /** Rounds only the top corners (sheets). Wins over `radius`. */
  topRadius?: RadiusToken;
  /** Floats over its siblings at these offsets from the parent's edges (menus, toasts, scrims). */
  float?: { top?: number; right?: number; bottom?: number; left?: number };
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  direction?: 'row' | 'column';
  wrap?: boolean;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  selected?: boolean;
  accessibilityRole?: 'alert' | 'progressbar' | 'image' | 'header' | 'menu';
  accessibilityValue?: { min: number; max: number; now: number };
  accessibilityLiveRegion?: 'polite' | 'assertive';
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

export function boxStyle(props: BoxProps, theme: Tokens): Mutable<ViewStyle> {
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
  if (props.w !== undefined) style.width = props.w;
  if (props.h !== undefined) style.height = props.h;
  if (props.float) {
    style.position = 'absolute';
    if (props.float.top !== undefined) style.top = props.float.top;
    if (props.float.right !== undefined) style.right = props.float.right;
    if (props.float.bottom !== undefined) style.bottom = props.float.bottom;
    if (props.float.left !== undefined) style.left = props.float.left;
    style.zIndex = 2;
  }
  if (props.align) style.alignItems = ALIGN[props.align];
  if (props.justify) style.justifyContent = JUSTIFY[props.justify];
  if (props.topRadius) {
    style.borderTopLeftRadius = theme.radius[props.topRadius];
    style.borderTopRightRadius = theme.radius[props.topRadius];
  }
  if (props.minH !== undefined) style.minHeight = props.minH;
  if (props.maxH !== undefined) style.maxHeight = props.maxH;
  if (props.opacity !== undefined) style.opacity = props.opacity;
  return style;
}

export function Box(props: BoxProps): ReactElement {
  const theme = useTheme();
  const style = boxStyle(props, theme);
  return (
    <View
      style={style}
      testID={props.testID}
      accessible={props.accessibilityLabel ? true : undefined}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole={props.accessibilityRole}
      accessibilityValue={props.accessibilityValue}
      accessibilityLiveRegion={props.accessibilityLiveRegion}
      accessibilityState={props.selected === undefined ? undefined : { selected: props.selected }}
    >
      {props.children}
    </View>
  );
}
