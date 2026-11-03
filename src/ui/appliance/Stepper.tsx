import type { ReactElement, ReactNode } from 'react';
import Animated from 'react-native-reanimated';
import { Icon } from '../Icon';
import { Box, Touchable } from '../primitives';

export interface StepperProps {
  icon: 'minus' | 'plus';
  label: string;
  onPress: () => void;
  disabled: boolean;
}

/** Mock `.step-b.is-disabled`. */
const DISABLED_OPACITY = 0.35;

/**
 * A 64 px round − or + beside the AC dial. The filled disc carries the shadow (Android draws no
 * elevation for a transparent view) inside the Touchable, so the shadow scales and dims with it.
 */
export function Stepper(props: StepperProps): ReactElement {
  return (
    <Touchable
      onPress={props.onPress}
      disabled={props.disabled}
      disabledOpacity={DISABLED_OPACITY}
      accessibilityLabel={props.label}
      radius="pill"
      pressScale={0.9}
    >
      <Box
        w={64}
        h={64}
        radius="pill"
        bg="surface"
        border="line"
        shadow="card"
        align="center"
        justify="center"
        testID={`stepper-${props.icon}`}
      >
        <Icon name={props.icon} size={30} strokeWidth={2.4} />
      </Box>
    </Touchable>
  );
}

/** Mock `.stepper`: the − and + at the dial's bottom corners, 14 px in and 6 px below its box. */
export function StepperRow(props: { children: ReactNode }): ReactElement {
  return (
    <Animated.View
      testID="stepper-row"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: -6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
      }}
    >
      {props.children}
    </Animated.View>
  );
}
