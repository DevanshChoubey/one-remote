import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { t } from '@/i18n';
import { useMotion } from '@/theme';
import { AnimatedBox, Box, Mark, Txt } from '@/ui';

const SAFETY_MS = 3000;
/** The title rises in once the ring is mostly drawn (mock `.splash h1`, 700 ms). */
const TITLE_DELAY = 700;
/** Mock frame: 52 px above the content (status bar), the caption 38 px from the bottom. */
const TOP = 52;
const BOTTOM = 38;

export interface LaunchOverlayProps {
  /** The home data has loaded. */
  ready: boolean;
  /** Called once the overlay has faded out and unmounted itself. */
  onGone?: () => void;
}

/**
 * The launch screen: the mark draws itself over the app's background, then, once the app is ready
 * and the mark has finished, the whole screen fades out and unmounts. Hides the native splash as
 * soon as it is on screen, so the two read as one.
 */
export function LaunchOverlay(props: LaunchOverlayProps): ReactElement | null {
  const motion = useMotion();
  const [drawn, setDrawn] = useState(false);
  const [gone, setGone] = useState(false);
  const [forced, setForced] = useState(false);
  const opacity = useSharedValue(1);
  const fastMs = motion.duration.fast;
  const onGoneRef = useRef(props.onGone);
  useEffect(() => {
    onGoneRef.current = props.onGone;
  }, [props.onGone]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  // Reduced motion: the title is there from the first frame, like the mark.
  const rise = useSharedValue(motion.reduced ? 1 : 0);
  useEffect(() => {
    if (motion.reduced) return;
    rise.value = withDelay(TITLE_DELAY, withTiming(1, motion.timing('base', 'enter')));
    // Plays once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lift = motion.lift;
  const titleStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * lift }],
  }));

  const onDone = useCallback((): void => setDrawn(true), []);
  // Safety net: a store read that never settles, or a mark animation that is cut short, must not
  // keep the app covered for ever.
  useEffect(() => {
    const timer = setTimeout(() => setForced(true), SAFETY_MS);
    return () => clearTimeout(timer);
  }, []);
  const leaving = forced || (props.ready && drawn);
  useEffect(() => {
    if (!leaving) return undefined;
    opacity.value = withTiming(0, motion.timing('fast', 'exit'));
    const timer = setTimeout(() => {
      setGone(true);
      onGoneRef.current?.();
    }, fastMs);
    return () => clearTimeout(timer);
  }, [leaving, opacity, motion, fastMs]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (gone) return null;
  return (
    <AnimatedBox
      testID="launch-overlay"
      float={{ top: 0, left: 0, right: 0, bottom: 0 }}
      bg="bg"
      accessibilityLabel={t('common.loading')}
      align="center"
      pointerEvents={leaving ? 'none' : 'auto'}
      animatedStyle={style}
    >
      {/* Mock: the mark and title centre in the space above the caption, 20 px above it. */}
      <Box h={TOP} />
      <Box flex={1} align="center" justify="center" gap={5}>
        <Mark animate onDone={onDone} />
        <AnimatedBox animatedStyle={titleStyle}>
          <Txt variant="title">{t('common.appName')}</Txt>
        </AnimatedBox>
      </Box>
      <Box h={20} />
      <Box px={6} align="center">
        <Txt variant="caption" color="ink2" align="center">
          {t('common.tagline')}
        </Txt>
      </Box>
      <Box h={BOTTOM} />
    </AnimatedBox>
  );
}
