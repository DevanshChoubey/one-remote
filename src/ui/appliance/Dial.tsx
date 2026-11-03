import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 290;
const CENTRE = SIZE / 2;
const RADIUS = 126;
const STROKE = 18;
/** The visible 270 degrees of the ring. */
const ARC = 2 * Math.PI * RADIUS * 0.75;
const DIGIT_W = 43;
const DIGIT_H = 80;
const OFF_SCALE = 52 / 76;

export interface DialProps {
  value: number;
  min: number;
  max: number;
  on: boolean;
  tone: 'cool' | 'ink2' | 'accent';
  /** The line under the number (the mode name, or the hint while off). */
  caption: string;
  accessibilityLabel: string;
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
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
    opacity: shown.value,
  }));

  const [track, setTrack] = useState({ value: props.value, dir: 1 as 1 | -1 });
  if (track.value !== props.value) {
    setTrack({ value: props.value, dir: props.value > track.value ? 1 : -1 });
  }

  const dash = `${ARC} 999`;
  const digits = String(Math.round(props.value)).split('');
  return (
    <Box w={SIZE} h={SIZE}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} accessible={false}>
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
          <Circle
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            stroke={theme.color.surface}
            strokeWidth={STROKE - 3}
            strokeLinecap="round"
            strokeDasharray={dash}
            fill="none"
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
          <Box
            align="center"
            justify="center"
            h={DIGIT_H}
            accessibilityRole="image"
            accessibilityLabel={props.accessibilityLabel}
            accessibilityLiveRegion="polite"
          >
            {props.on ? (
              <Row justify="center">
                {digits.map((d, i) => (
                  <Digit key={digits.length - i} char={d} dir={track.dir} />
                ))}
                <Animated.View style={{ marginTop: 6 }}>
                  <Txt variant="title">°</Txt>
                </Animated.View>
              </Row>
            ) : (
              // "Off" is the display size scaled to the mock's 52 px.
              <Animated.View style={{ transform: [{ scale: OFF_SCALE }], paddingTop: 12 }}>
                <Txt variant="display" color="ink2">
                  {t('ac.off')}
                </Txt>
              </Animated.View>
            )}
          </Box>
          <Animated.View style={{ marginTop: 6 }}>
            <Txt variant="bodyBold" color="ink2">
              {props.caption}
            </Txt>
          </Animated.View>
        </Animated.View>
      </Box>
    </Box>
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

  const shift = reduced ? 0 : DIGIT_H * 0.7;
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
    <Animated.View style={{ width: DIGIT_W, height: DIGIT_H, overflow: 'hidden' }}>
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
