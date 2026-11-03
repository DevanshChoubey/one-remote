import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotion, useTheme } from '@/theme';
import { Icon } from '../Icon';
import { Row, Txt } from '../primitives';

export interface CameraFrameProps {
  /** A valid code was seen: the brackets tighten and turn green, the beam stops. */
  locked: boolean;
  /** Shown at the top, e.g. "Point at the Matter QR code". */
  hint: string;
  /** Shown in the badge once locked, e.g. "Matter code". */
  lockLabel: string;
  /** The live camera feed. */
  children: ReactNode;
}

const OPEN = 188;
const LOCKED = 150;
const SWEEP = 84;
const CORNERS = [
  { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 'tile' },
  { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 'tile' },
  { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 'tile' },
  {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 'tile',
  },
] as const;

function Bracket(props: {
  corner: (typeof CORNERS)[number];
  lock: { value: number };
}): ReactElement {
  const theme = useTheme();
  const { corner, lock } = props;
  const open = theme.color.cameraInk;
  const locked = theme.color.cameraLock;
  const style = useAnimatedStyle(() => ({
    borderColor: interpolateColor(lock.value, [0, 1], [open, locked]),
  }));
  const shape: Record<string, number> = {};
  for (const [k, v] of Object.entries(corner)) {
    if (k.endsWith('Radius')) shape[k] = theme.radius[v as 'tile'];
    else shape[k] = v as number;
  }
  return (
    <Animated.View
      style={[{ position: 'absolute', width: 36, height: 36, ...shape }, style]}
      testID="scan-bracket"
    />
  );
}

/** The camera preview with the scan overlay: hint, four corner brackets, a sweeping beam, lock badge. */
export function CameraFrame(props: CameraFrameProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const { locked, hint, lockLabel } = props;
  const lock = useSharedValue(locked ? 1 : 0);
  const size = useSharedValue(locked ? LOCKED : OPEN);
  const badge = useSharedValue(locked ? 1 : 0);
  const sweep = useSharedValue(-SWEEP);
  const sweeping = !locked && !motion.reduced;

  useEffect(() => {
    const target = locked ? 1 : 0;
    const to = locked ? LOCKED : OPEN;
    if (motion.reduced) {
      // Moves become fades: the size jumps, the colour and badge cross-fade.
      size.value = to;
      lock.value = withTiming(target, motion.timing('fast'));
      badge.value = withTiming(target, motion.timing('fast'));
    } else {
      size.value = withTiming(to, motion.timing('base', 'spring'));
      lock.value = withTiming(target, motion.timing('fast'));
      badge.value = withTiming(target, motion.timing('base', 'enter'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, motion.reduced]);

  useEffect(() => {
    cancelAnimation(sweep);
    sweep.value = -SWEEP;
    if (sweeping) {
      sweep.value = withRepeat(
        withTiming(SWEEP, { duration: 1800, easing: motion.ease.standard }),
        -1,
        true,
      );
    }
    return () => cancelAnimation(sweep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweeping]);

  const box = useAnimatedStyle(() => ({ width: size.value, height: size.value }));
  const beam = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value }] }));
  const { reduced: reducedMotion } = motion;
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ translateY: reducedMotion ? 0 : 10 * (1 - badge.value) }],
  }));

  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
  return (
    <Animated.View
      style={{
        height: 280,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.color.cameraBg,
        overflow: 'hidden',
      }}
      testID="camera-frame"
    >
      <Animated.View style={fill}>{props.children}</Animated.View>
      <Animated.View
        style={{ ...fill, alignItems: 'center', justifyContent: 'center' }}
        pointerEvents="none"
      >
        <Animated.View style={box}>
          {CORNERS.map((c, i) => (
            <Bracket key={i} corner={c} lock={lock} />
          ))}
        </Animated.View>
        {sweeping ? (
          <Animated.View
            testID="scan-beam"
            style={[
              {
                position: 'absolute',
                width: 176,
                height: 3,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.color.cameraBeam,
              },
              beam,
            ]}
          />
        ) : null}
      </Animated.View>
      <Animated.View
        style={{ position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center' }}
      >
        <Txt variant="label" color="cameraInk">
          {hint}
        </Txt>
      </Animated.View>
      <Animated.View
        style={{ position: 'absolute', bottom: 14, left: 0, right: 0, alignItems: 'center' }}
        pointerEvents="none"
      >
        <Animated.View
          testID="scan-lock"
          style={[
            {
              backgroundColor: theme.color.cameraBadge,
              borderRadius: theme.radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 6,
            },
            badgeStyle,
          ]}
        >
          <Row gap={2} align="center">
            <Icon name="check" size={18} strokeWidth={3} color="cameraInk" />
            <Txt variant="bodyBold" color="cameraInk" live>
              {locked ? lockLabel : ''}
            </Txt>
          </Row>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
