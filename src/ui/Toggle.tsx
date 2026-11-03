import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { AnimatedBox, Row, Touchable, Txt } from './primitives';
import { mixColor } from './primitives/Touchable';

export interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Keeps the spoken label but shows only the switch (e.g. on a card that already names it). */
  hideLabel?: boolean;
  /** Disabled but not dimmed: the parent (an off card) already dims it. */
  noDim?: boolean;
}

const TRACK_W = 52;
const TRACK_H = 32;
const THUMB = 26;
const THUMB_PRESSED = 32;
const INSET = (TRACK_H - THUMB) / 2;
const TRAVEL = TRACK_W - THUMB - 2 * INSET; // 20

/** The whole row is the control: one announcement, and tapping the label toggles it. */
export function Toggle(props: ToggleProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const on = props.value;
  // `slide` and `tint` follow the value (slide springs over `base`, tint fades over `fast`);
  // `grip` widens the thumb while the finger is down. Reduced motion jumps the thumb.
  const slide = useSharedValue(on ? 1 : 0);
  const tint = useSharedValue(on ? 1 : 0);
  const grip = useSharedValue(0);
  useEffect(() => {
    const to = on ? 1 : 0;
    slide.value = motion.reduced ? to : withTiming(to, motion.timing('base', 'spring'));
    tint.value = withTiming(to, motion.timing('fast'));
  }, [on, slide, tint, motion]);
  const wide = motion.reduced ? 0 : THUMB_PRESSED - THUMB;
  const off = theme.color.ink2;
  const lit = theme.color.accent;
  const track = useAnimatedStyle(
    () => ({ backgroundColor: mixColor(tint.value, off, lit) }),
    [off, lit],
  );
  const thumb = useAnimatedStyle(() => {
    const extra = wide * grip.value;
    // Grows toward the left when the switch is on, so it stays inside the track.
    return {
      width: THUMB + extra,
      transform: [{ translateX: slide.value * (TRAVEL - extra) }],
    };
  }, [wide]);
  return (
    <Touchable
      onPress={() => props.onChange(!props.value)}
      onPressIn={() => {
        grip.set(withTiming(1, motion.timing('instant')));
      }}
      onPressOut={() => {
        grip.set(withTiming(0, motion.timing('instant')));
      }}
      accessibilityLabel={props.label}
      accessibilityRole="switch"
      checked={props.value}
      disabled={props.disabled}
      noDim={props.noDim}
      pressScale={1}
    >
      <Row align="center" justify={props.hideLabel ? 'end' : 'between'} gap={3}>
        {props.hideLabel ? null : <Txt variant="bodyBold">{props.label}</Txt>}
        <AnimatedBox
          testID="toggle-track"
          w={TRACK_W}
          h={TRACK_H}
          radius="pill"
          animatedStyle={track}
        >
          <AnimatedBox
            testID="toggle-thumb"
            bg="surface"
            radius="pill"
            shadow="card"
            h={THUMB}
            float={{ top: INSET, left: INSET }}
            animatedStyle={thumb}
          />
        </AnimatedBox>
      </Row>
    </Touchable>
  );
}
