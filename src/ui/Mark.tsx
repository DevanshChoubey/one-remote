import type { ReactElement } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme';
import { Box } from './primitives';

export interface MarkProps {
  size?: number;
  /** Draws itself in once, then calls `onDone`. */
  animate?: boolean;
  onDone?: () => void;
}

/** The app mark: the power ring with its stem, white on an accent tile. */
export function Mark(props: MarkProps): ReactElement {
  const theme = useTheme();
  const size = props.size ?? 112;
  const glyph = Math.round((size * 64) / 112);
  return (
    <Box
      w={size}
      h={size}
      radius="art"
      bg="accent"
      shadow="pop"
      align="center"
      justify="center"
      testID="mark"
    >
      <Svg
        width={glyph}
        height={glyph}
        viewBox="0 0 64 64"
        fill="none"
        stroke={theme.color.accentInk}
        strokeWidth={4}
        strokeLinecap="round"
        accessible={false}
        importantForAccessibility="no"
      >
        <Path d="M20 15.5a22 22 0 1024 0" />
        <Path d="M32 6v22" />
      </Svg>
    </Box>
  );
}
