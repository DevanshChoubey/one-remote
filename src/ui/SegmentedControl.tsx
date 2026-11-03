import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Row, Touchable, Txt } from './primitives';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<V extends string> {
  /** Names the group for the screen reader. */
  label: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
}

const PAD = 4;
const GAP = 2;
/** Mock `.seg button .i` margin-right. */
const ICON_GAP = 6;

export function SegmentedControl<V extends string>(props: SegmentedControlProps<V>): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const n = props.options.length;
  const index = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.value),
  );
  const [width, setWidth] = useState(0);
  const segment = n > 0 ? Math.max(0, (width - 2 * PAD - GAP * (n - 1)) / n) : 0;
  const pos = useSharedValue(index);
  useEffect(() => {
    pos.value = motion.reduced ? index : withTiming(index, motion.timing('base'));
  }, [index, pos, motion]);
  const thumb = useAnimatedStyle(
    () => ({
      width: segment,
      transform: [{ translateX: pos.value * (segment + GAP) }],
    }),
    [segment],
  );
  return (
    <Animated.View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityState={props.disabled ? { disabled: true } : undefined}
      style={{
        opacity: props.disabled ? 0.42 : 1,
        backgroundColor: theme.color.surface2,
        borderRadius: theme.radius.pill,
        padding: PAD,
      }}
    >
      {/* The mock's ring is an inset box-shadow: drawn over the edge, it takes no layout space. */}
      <Animated.View
        testID="segment-ring"
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: theme.color.line,
        }}
      />
      <Animated.View
        testID="segment-thumb"
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: PAD,
            bottom: PAD,
            left: PAD,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.surface,
            ...theme.shadow.card,
          },
          thumb,
        ]}
      />
      <Row gap={0}>
        {props.options.map((o, i) => {
          const selected = o.value === props.value;
          return (
            <Animated.View key={o.value} style={{ flex: 1, marginLeft: i === 0 ? 0 : GAP }}>
              <Touchable
                onPress={() => props.onChange(o.value)}
                accessibilityRole="togglebutton"
                accessibilityLabel={o.label}
                selected={selected}
                disabled={props.disabled}
                noDim
                radius="pill"
                pressScale={1}
              >
                <Row align="center" justify="center" px={2}>
                  {o.icon ? (
                    <Animated.View style={{ marginRight: ICON_GAP }}>
                      <Icon name={o.icon} size={18} color={selected ? 'ink' : 'ink2'} />
                    </Animated.View>
                  ) : null}
                  <Txt variant="label" color={selected ? 'ink' : 'ink2'}>
                    {o.label}
                  </Txt>
                </Row>
              </Touchable>
            </Animated.View>
          );
        })}
      </Row>
    </Animated.View>
  );
}
