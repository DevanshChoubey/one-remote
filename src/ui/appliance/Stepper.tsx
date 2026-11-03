import type { ReactElement } from 'react';
import { Icon } from '../Icon';
import { Box, Touchable } from '../primitives';

export interface StepperProps {
  icon: 'minus' | 'plus';
  label: string;
  onPress: () => void;
  disabled: boolean;
}

/** A 64 px round − or + beside the AC dial. */
export function Stepper(props: StepperProps): ReactElement {
  return (
    <Box radius="pill" shadow="card">
      <Touchable
        onPress={props.onPress}
        disabled={props.disabled}
        accessibilityLabel={props.label}
        radius="pill"
        bg="surface"
        border="line"
        pressedBg="surface2"
        pressScale={0.9}
      >
        <Box w={64} h={64} align="center" justify="center">
          <Icon name={props.icon} size={30} strokeWidth={2.4} />
        </Box>
      </Touchable>
    </Box>
  );
}
