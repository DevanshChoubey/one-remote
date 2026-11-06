import type { ReactElement, ReactNode } from 'react';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { Pressable, experimental_LayoutConformance as LayoutConformance } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import type { ColorToken, RadiusToken } from '@/theme';
import { DimmedContext } from './dimmed';

export interface TouchableProps {
  onPress: () => void;
  onLongPress?: () => void;
  /** For hold-to-talk: the finger went down / came up. `onPress` still fires on a release. */
  onPressIn?: () => void;
  onPressOut?: () => void;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'checkbox' | 'togglebutton' | 'switch';
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean;
  busy?: boolean;
  expanded?: boolean;
  /** Looks dimmed (0.6, like an off card) but still takes presses, e.g. to allow a long press. */
  dimmed?: boolean;
  accessibilityHint?: string;
  /** Extra screen reader actions (the swipe-up/down menu), for what a long press does. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  /** Scale while pressed: 0.97 by default, 1 for none. */
  pressScale?: number;
  /** Background tint while pressed; the wrapper draws it. */
  pressedBg?: ColorToken;
  /** The wrapper is the visible surface of buttons, chips and menu rows. */
  bg?: ColorToken;
  border?: ColorToken;
  radius?: RadiusToken;
  /** Stretches to fill its parent (scrims). */
  fill?: boolean;
  /** Disabled but not dimmed (a button that is busy keeps its colour and shows a spinner). */
  noDim?: boolean;
  /** Opacity when disabled; 0.42 by default. */
  disabledOpacity?: number;
  alignSelf?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  /** Grows along the parent's main axis (equal-width buttons in a Row). */
  flex?: number;
  testID?: string;
  children: ReactNode;
}

/**
 * Blends two colours by `t` (0..1). It returns the exact input colour at rest (0 or 1), so a theme
 * change shows the new token at once and not an blended approximation of it.
 */
export function mixColor(t: number, from: string, to: string): string {
  'worklet';
  if (t <= 0) return from;
  if (t >= 1) return to;
  return interpolateColor(t, [0, 1], [from, to]);
}

export function Touchable(props: TouchableProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  // 0 = at rest, 1 = pressed. Pressing is quick; the release springs back.
  const press = useSharedValue(0);
  const target = motion.reduced ? 1 : (props.pressScale ?? 0.97);
  const base = props.bg ? theme.color[props.bg] : 'transparent';
  const pressed = props.pressedBg ? theme.color[props.pressedBg] : base;
  const instant = motion.timing('instant');
  const release = motion.timing('fast', 'spring');
  const animated = useAnimatedStyle(
    () => ({
      backgroundColor: mixColor(press.value, base, pressed),
      transform: [{ scale: 1 + (target - 1) * press.value }],
    }),
    [base, pressed, target],
  );
  const dim = props.disabled && !props.noDim ? (props.disabledOpacity ?? 0.42) : null;
  // Strict (W3C) layout: under RN's legacy errata the surface's flexGrow fills all the height a
  // centring parent offers, so a lone button in a full-screen panel grew to the panel's height.
  return (
    <LayoutConformance mode="strict">
      <Pressable
        onPress={props.onPress}
        onLongPress={props.onLongPress}
        onPressIn={() => {
          press.set(withTiming(1, instant));
          props.onPressIn?.();
        }}
        onPressOut={() => {
          press.set(withTiming(0, release));
          props.onPressOut?.();
        }}
        disabled={props.disabled}
        testID={props.testID}
        accessibilityLabel={props.accessibilityLabel}
        accessibilityHint={props.accessibilityHint}
        accessibilityActions={props.accessibilityActions}
        onAccessibilityAction={props.onAccessibilityAction}
        accessibilityRole={props.accessibilityRole ?? 'button'}
        accessibilityState={{
          disabled: props.disabled === true,
          selected: props.selected,
          checked: props.checked,
          busy: props.busy,
          expanded: props.expanded,
        }}
        style={{
          minHeight: theme.touch.min,
          minWidth: theme.touch.min,
          justifyContent: 'center',
          opacity: dim ?? (props.dimmed ? 0.6 : 1),
          ...(props.fill ? { flex: 1, alignSelf: 'stretch' as const } : null),
          ...(props.alignSelf ? { alignSelf: props.alignSelf } : null),
          ...(props.flex === undefined ? null : { flex: props.flex }),
        }}
      >
        <Animated.View
          testID={props.testID ? `${props.testID}-surface` : undefined}
          style={[
            {
              flexGrow: 1,
              justifyContent: 'center',
              minHeight: theme.touch.min,
              minWidth: theme.touch.min,
              ...(props.border ? { borderColor: theme.color[props.border], borderWidth: 1 } : null),
              ...(props.radius ? { borderRadius: theme.radius[props.radius] } : null),
            },
            animated,
          ]}
        >
          <DimmedContext.Provider value={dim !== null || props.dimmed === true}>
            {props.children}
          </DimmedContext.Provider>
        </Animated.View>
      </Pressable>
    </LayoutConformance>
  );
}
