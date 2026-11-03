import type { ReactElement } from 'react';
import { Box, Touchable, Txt } from '../primitives';

export interface TextLinkProps {
  label: string;
  onPress: () => void;
  /** Where it sits on its line: centred (the default) or at the start. */
  align?: 'center' | 'start';
  /** Opens something outside the app (mail): role link instead of button. */
  external?: boolean;
  testID?: string;
}

/**
 * The mock's `.link`: accent text at 600, 48 high, 12 px side padding, as wide as its label, with
 * the ghost press tint. The add flows use it for the quiet way out under a step.
 */
export function TextLink(props: TextLinkProps): ReactElement {
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      accessibilityRole={props.external ? 'link' : 'button'}
      alignSelf={props.align === 'start' ? 'flex-start' : 'center'}
      radius="pill"
      pressedBg="accentSoft"
      testID={props.testID}
    >
      <Box px={3} minH={48} justify="center">
        <Txt color="accent" weight="semibold" align="center">
          {props.label}
        </Txt>
      </Box>
    </Touchable>
  );
}
