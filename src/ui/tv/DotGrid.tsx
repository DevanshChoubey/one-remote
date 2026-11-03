import type { ReactElement } from 'react';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';

export interface DotGridProps {
  /** Distance between dots in px. */
  spacing?: number;
}

/** The touchpad's dot grid: 1.5 px `line` dots on a fixed pitch, filling its parent. */
export function DotGrid(props: DotGridProps): ReactElement {
  const theme = useTheme();
  const spacing = props.spacing ?? 28;
  return (
    <Svg width="100%" height="100%" accessible={false} importantForAccessibility="no">
      <Defs>
        <Pattern id="pad-dots" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle cx={spacing / 2} cy={spacing / 2} r={1.5} fill={theme.color.line} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#pad-dots)" />
    </Svg>
  );
}
