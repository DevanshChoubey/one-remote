import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import { t } from '@/i18n';
import { useMotion, useTheme } from '@/theme';
import { AnimatedBox, Box, Row, Txt } from '../primitives';
import { Skeleton } from '../Skeleton';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 290;
const CENTRE = SIZE / 2;
const RADIUS = 126;
const STROKE = 18;
/** The visible 270 degrees of the ring. */
const ARC = 2 * Math.PI * RADIUS * 0.75;
const DIGIT_W = 43;
const DIGIT_H = 80;

export interface DialProps {
  value: number;
  min: number;
  max: number;
  on: boolean;
  tone: 'cool' | 'ink2' | 'accent';
  /** The line under the number (the mode name, or the hint while off). */
  caption: string;
  accessibilityLabel: string;
  /** Screen reader increment / decrement (the same as the steppers). */
  onIncrement?: () => void;
  onDecrement?: () => void;
  /** Floated over the dial's box (the steppers at its bottom corners). */
  children?: ReactNode;
}

/** The AC dial: a 270 degree arc that fills with the setpoint, the number rolling in its centre. */
export function Dial(props: DialProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const span = props.max - props.min;
  const frac = span > 0 ? Math.min(1, Math.max(0, (props.value - props.min) / span)) : 0;
  const target = props.on ? ARC * (1 - frac) : ARC;
  const offset = useSharedValue(target);
  const shown = useSharedValue(props.on ? 1 : 0);
  const reduced = motion.reduced;
  useEffect(() => {
    offset.value = reduced ? target : withTiming(target, motion.timing('base'));
  }, [target, reduced, offset, motion]);
  useEffect(() => {
    shown.value = withTiming(props.on ? 1 : 0, motion.timing('fast'));
  }, [props.on, shown, motion]);
  // A mode change fades the arc to the new colour (mock `.arc` stroke transition, base): the new
  // arc fades in over the old one. The tones, not the colours, are kept, so a theme change
  // recolours at once.
  const [tones, setTones] = useState({ from: props.tone, to: props.tone });
  if (tones.to !== props.tone) setTones({ from: tones.to, to: props.tone });
  const mix = useSharedValue(1);
  useEffect(() => {
    if (tones.from === tones.to) return;
    mix.value = 0;
    mix.value = reduced ? 1 : withTiming(1, motion.timing('base'));
  }, [tones, mix, reduced, motion]);
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
    opacity: shown.value * mix.value,
  }));
  const fromProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
    opacity: mix.value < 1 ? shown.value : 0,
  }));

  const [track, setTrack] = useState({ value: props.value, dir: 1 as 1 | -1 });
  if (track.value !== props.value) {
    setTrack({ value: props.value, dir: props.value > track.value ? 1 : -1 });
  }

  const dash = `${ARC} 999`;
  const digits = String(Math.round(props.value)).split('');
  return (
    // Mock `.dialwrap`: 290 square, 8 px below what is above it.
    <Animated.View
      testID="dial"
      style={{
        width: '100%',
        maxWidth: SIZE,
        aspectRatio: 1,
        alignSelf: 'center',
        marginTop: theme.space(2),
      }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} accessible={false}>
        <G rotation={135} origin={`${CENTRE}, ${CENTRE}`}>
          <Circle
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            stroke={theme.color.line}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={dash}
            fill="none"
          />
          <AnimatedCircle
            testID="dial-arc-from"
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            stroke={theme.color[tones.from]}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={dash}
            fill="none"
            animatedProps={fromProps}
          />
          <AnimatedCircle
            testID="dial-arc"
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            stroke={theme.color[props.tone]}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={dash}
            fill="none"
            animatedProps={arcProps}
          />
        </G>
      </Svg>
      <Box float={{ top: 0, right: 0, bottom: 0, left: 0 }} align="center" justify="center">
        <Animated.View style={{ marginTop: -38, alignItems: 'center' }}>
          <Animated.View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={props.accessibilityLabel}
            accessibilityValue={{ min: props.min, max: props.max, now: props.value }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'increment') props.onIncrement?.();
              if (e.nativeEvent.actionName === 'decrement') props.onDecrement?.();
            }}
            accessibilityLiveRegion="polite"
            style={{ minHeight: DIGIT_H, alignItems: 'center', justifyContent: 'center' }}
          >
            {props.on ? (
              <Row justify="center">
                {digits.map((d, i) => (
                  <Digit key={digits.length - i} char={d} dir={track.dir} />
                ))}
                <Animated.View style={{ marginTop: 6 }}>
                  <Txt variant="label" size="displaySup">
                    °
                  </Txt>
                </Animated.View>
              </Row>
            ) : (
              <Animated.View style={{ paddingTop: 12 }}>
                <Txt variant="display" size="dialOff" color="ink2">
                  {t('ac.off')}
                </Txt>
              </Animated.View>
            )}
          </Animated.View>
          <Animated.View style={{ marginTop: 6 }}>
            <Txt color="ink2" weight="semibold">
              {props.caption}
            </Txt>
          </Animated.View>
        </Animated.View>
      </Box>
      {props.children}
    </Animated.View>
  );
}

/** Mock `skelAc`: the dial's 290 disc as a skeleton, 8 px below what is above it. */
export function DialSkeleton(): ReactElement {
  const theme = useTheme();
  return (
    <Animated.View
      testID="dial-skeleton"
      style={{
        width: '100%',
        maxWidth: SIZE,
        aspectRatio: 1,
        alignSelf: 'center',
        marginTop: theme.space(2),
        opacity: 0.7,
      }}
    >
      <Skeleton width="100%" height="100%" radius="pill" />
    </Animated.View>
  );
}

interface DigitState {
  cur: string;
  prev: string | null;
  dir: 1 | -1;
  key: number;
}

/** One digit of the number: on a change the old one leaves and the new one enters (70 %, fast). */
function Digit(props: { char: string; dir: 1 | -1 }): ReactElement {
  const motion = useMotion();
  // The digits grow with the system font size, so their boxes must too or they are clipped.
  const { fontScale } = useWindowDimensions();
  const scale = Math.max(1, fontScale);
  const digitW = Math.round(DIGIT_W * scale);
  const digitH = Math.round(DIGIT_H * scale);
  const [s, setS] = useState<DigitState>({ cur: props.char, prev: null, dir: props.dir, key: 0 });
  if (s.cur !== props.char) {
    setS({ cur: props.char, prev: s.cur, dir: props.dir, key: s.key + 1 });
  }
  const progress = useSharedValue(1);
  const reduced = motion.reduced;
  const fast = motion.duration.fast;
  const { key } = s;
  useEffect(() => {
    if (key === 0) return undefined;
    progress.value = 0;
    progress.value = withTiming(1, motion.timing('fast'));
    const timer = setTimeout(() => {
      setS((x) => (x.key === key ? { ...x, prev: null } : x));
    }, fast + 40);
    return () => clearTimeout(timer);
  }, [key, progress, motion, fast]);

  const shift = reduced ? 0 : digitH * 0.7;
  const dir = s.dir;
  const enter = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * dir * shift }],
  }));
  const leave = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -progress.value * dir * shift }],
  }));
  return (
    <Animated.View style={{ width: digitW, height: digitH, overflow: 'hidden' }}>
      {s.prev !== null ? (
        <AnimatedBox
          float={{ top: 0, right: 0, bottom: 0, left: 0 }}
          align="center"
          justify="center"
          animatedStyle={leave}
        >
          <Txt variant="display">{s.prev}</Txt>
        </AnimatedBox>
      ) : null}
      <AnimatedBox
        float={{ top: 0, right: 0, bottom: 0, left: 0 }}
        align="center"
        justify="center"
        animatedStyle={enter}
      >
        <Txt variant="display">{s.cur}</Txt>
      </AnimatedBox>
    </Animated.View>
  );
}
