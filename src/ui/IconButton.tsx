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
