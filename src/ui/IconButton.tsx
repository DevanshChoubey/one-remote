import type { ReactElement } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box, Touchable } from './primitives';

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** `power` draws the icon in the danger ink. */
  tone?: 'ink' | 'power';
  /** No disc or ring: just the icon (sheet close, bar actions on a bare background). */
  flat?: boolean;
  expanded?: boolean;
  /** On/off state (power buttons): the button becomes a switch that reports `checked`. */
  checked?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** A 48 px round icon control. */
export function IconButton(props: IconButtonProps): ReactElement {
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      expanded={props.expanded}
      checked={props.checked}
      accessibilityRole={props.checked === undefined ? 'button' : 'switch'}
      testID={props.testID}
      radius="pill"
      bg={props.flat ? undefined : 'surface'}
      border={props.flat ? undefined : 'line'}
      pressedBg="surface2"
      pressScale={0.92}
      disabledOpacity={0.4}
    >
      <Box w={48} h={48} align="center" justify="center">
        <Icon name={props.icon} color={props.tone === 'power' ? 'dangerInk' : 'ink'} />
      </Box>
    </Touchable>
  );
}
