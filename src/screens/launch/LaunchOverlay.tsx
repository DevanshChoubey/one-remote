import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { t } from '@/i18n';
import { useMotion } from '@/theme';
import { AnimatedBox, Box, Mark, Txt } from '@/ui';

const SAFETY_MS = 3000;

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
      justify="center"
      gap={5}
      pointerEvents={leaving ? 'none' : 'auto'}
      animatedStyle={style}
    >
      <Mark animate onDone={onDone} />
      <Txt variant="title">{t('common.appName')}</Txt>
      <Box float={{ left: 24, right: 24, bottom: 48 }} align="center">
        <Txt variant="caption" color="ink2">
          {t('common.tagline')}
        </Txt>
      </Box>
    </AnimatedBox>
  );
}
