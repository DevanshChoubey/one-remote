import type { ReactElement } from 'react';
import { Box, Touchable, Txt } from '@/ui';

export interface KeyButtonProps {
  label: string;
  glyph: string;
  onPress: () => void;
  round?: boolean;
  primary?: boolean;
  big?: boolean;
}

/** One remote key: a glyph on a surface, spoken as `label`. */
export function KeyButton(props: KeyButtonProps): ReactElement {
  return (
    <Touchable onPress={props.onPress} accessibilityLabel={props.label}>
      <Box
        bg={props.primary ? 'accent' : 'surface'}
        border="line"
        radius={props.round ? 'pill' : 'md'}
        px={props.big ? 6 : 4}
        py={props.big ? 5 : 3}
        align="center"
        justify="center"
      >
        <Txt variant="heading" color={props.primary ? 'accentInk' : 'ink'}>
          {props.glyph}
        </Txt>
      </Box>
    </Touchable>
  );
}
