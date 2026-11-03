import type { ReactElement } from 'react';
import Animated from 'react-native-reanimated';
import type { AnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import { boxStyle } from './Box';
import type { BoxProps } from './Box';

export interface AnimatedBoxProps extends BoxProps {
  animatedStyle?: AnimatedStyle<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none';
}

/** A Box whose style can also be driven by Reanimated (opacity, transforms, colours). */
export function AnimatedBox(props: AnimatedBoxProps): ReactElement {
  const theme = useTheme();
  return (
    <Animated.View
      style={[boxStyle(props, theme), props.animatedStyle]}
      testID={props.testID}
      pointerEvents={props.pointerEvents}
      accessible={props.accessibilityLabel ? true : undefined}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole={props.accessibilityRole}
      accessibilityValue={props.accessibilityValue}
      accessibilityLiveRegion={props.accessibilityLiveRegion}
      accessibilityState={props.selected === undefined ? undefined : { selected: props.selected }}
    >
      {props.children}
    </Animated.View>
  );
}
