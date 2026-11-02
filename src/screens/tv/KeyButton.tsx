import type { ReactElement } from 'react';
import { Box, Touchable, Txt } from '@/ui';

export interface KeyButtonProps {
  label: string;
  glyph: string;
  onPress: () => void;
  round?: boolean;
  primary?: boolean;
  /** A fixed circle of this diameter (the bottom row: Back 64, Home 84). */
  circle?: number;
}

/** One remote key: a glyph on a surface, spoken as `label`. */
export function KeyButton(props: KeyButtonProps): ReactElement {
  const color = props.primary ? 'accentInk' : 'ink';
  return (
    <Touchable onPress={props.onPress} accessibilityLabel={props.label}>
      {props.circle ? (
        <Box
          w={props.circle}
          h={props.circle}
          bg="surface"
          border="line"
          radius="pill"
          align="center"
          justify="center"
        >
          <Txt variant="heading" color={color}>
            {props.glyph}
          </Txt>
        </Box>
      ) : (
        <Box
          bg={props.primary ? 'accent' : 'surface'}
          border="line"
          radius={props.round ? 'pill' : 'md'}
          px={4}
          py={3}
          align="center"
          justify="center"
        >
          <Txt variant="heading" color={color}>
            {props.glyph}
          </Txt>
        </Box>
      )}
    </Touchable>
  );
}
