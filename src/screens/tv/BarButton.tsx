import type { ReactElement, ReactNode } from 'react';
import type { ColorToken } from '@/theme';
import { Box, Touchable, Txt } from '@/ui';

/** A round icon button for the TV bar (34px circle on surface 2; the hit area stays 48px). */
export function BarButton(props: {
  /** A text glyph, or `icon` for one drawn from shapes (a glyph the phone's font lacks shows as a box). */
  glyph?: string;
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  color?: ColorToken;
  expanded?: boolean;
}): ReactElement {
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      {...(props.expanded === undefined ? {} : { expanded: props.expanded })}
    >
      <Box align="center">
        <Box
          w={34}
          h={34}
          bg="surface2"
          border="line"
          radius="pill"
          align="center"
          justify="center"
        >
          {props.icon ?? <Txt color={props.color ?? 'ink'}>{props.glyph}</Txt>}
        </Box>
      </Box>
    </Touchable>
  );
}
