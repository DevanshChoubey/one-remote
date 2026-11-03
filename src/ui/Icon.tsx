import type { ReactElement } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';
import type { ColorToken } from '@/theme';
import { ICON_SHAPES } from './iconPaths';
import type { IconShape } from './iconPaths';

export type IconName = keyof typeof ICON_SHAPES;

export const ICON_NAMES = Object.keys(ICON_SHAPES) as readonly IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorToken;
  strokeWidth?: number;
  testID?: string;
}

/** A decorative line icon from the mock's set; the control around it carries the label. */
export function Icon(props: IconProps): ReactElement {
  const theme = useTheme();
  const color = theme.color[props.color ?? 'ink'];
  const shapes: readonly IconShape[] = ICON_SHAPES[props.name];
  return (
    <Svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={props.strokeWidth ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      importantForAccessibility="no"
      testID={props.testID}
    >
      {shapes.map((s, i) => {
        if (s.t === 'path') return <Path key={i} d={s.d} />;
        if (s.t === 'circle') {
          return (
            <Circle
              key={i}
              cx={s.cx}
              cy={s.cy}
              r={s.r}
              fill={s.filled ? color : 'none'}
              stroke={s.noStroke ? 'none' : color}
            />
          );
        }
        return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />;
      })}
    </Svg>
  );
}
