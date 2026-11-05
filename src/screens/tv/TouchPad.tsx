import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { useMotion } from '@/theme';
import { AnimatedBox, Txt } from '@/ui';
import { DotGrid, PadLayers, TapRipple, TouchDot, createPadVisuals, usePadEnter } from '@/ui/tv';
import { createPadController } from './touchpad';

// The TV screen does not scroll (a scroll view takes up and down swipes from the pad), so the pad
// fills all the space between the bar and the keys.
const TAP_MS = 250;

/** A pan surface that turns swipes into arrow keys and a tap into OK. */
export function TouchPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const ctl = useMemo(() => createPadController(), []);
  const liveMotion = useMotion();
  const { reduced } = liveMotion;
  const { fast, base } = liveMotion.duration;
  // The gesture only needs the reduced flag and the durations, so it is not rebuilt (possibly
  // mid-touch) when the context hands over a new object with the same values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const motion = useMemo(() => liveMotion, [reduced, fast, base]);
  const enter = usePadEnter();
  useEffect(() => {
    ctl.setHandler(props.onKey);
  }, [ctl, props.onKey]);
  useEffect(() => ctl.stop, [ctl]);

  // The finger dot, the hint and the ripple are drawn from the gesture's own events, after the
  // controller has seen them, so they never delay a key.
  const dotX = useSharedValue(0);
  const dotY = useSharedValue(0);
  const dotShown = useSharedValue(0);
  const hintShown = useSharedValue(1);
  const [ripple, setRipple] = useState({ x: 0, y: 0, n: 0 });

  // A pan for moves and a tap for OK. The pad sits in a scrolling screen, so on Android the pan
  // takes the touch at once: waiting for travel lets the screen claim every up or down swipe as a
  // scroll. There the pan always wins and a still touch ends as OK (see `end`). On iPhone a pan with
  // no travel never activates, so it keeps the default travel and a still tap goes to the tap.
  const gesture = useMemo(() => {
    const ripples = (x: number, y: number): void => setRipple((r) => ({ x, y, n: r.n + 1 }));
    const visuals = createPadVisuals({
      x: dotX,
      y: dotY,
      dot: dotShown,
      hint: hintShown,
      motion,
      onTap: ripples,
    });
    const base = Gesture.Pan().runOnJS(true);
    const pan = (Platform.OS === 'android' ? base.minDistance(0) : base)
      .onBegin((e) => {
        ctl.begin(e.x, e.y);
        visuals.begin(e.x, e.y);
      })
      .onUpdate((e) => {
        ctl.update(e.x, e.y);
        visuals.update(e.x, e.y);
      })
      .onFinalize((e, success) => {
        if (success) ctl.finish(e.x, e.y);
        else ctl.cancel();
        visuals.end(e.x, e.y, success);
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(TAP_MS)
      .onEnd((e, success) => {
        if (success) {
          ctl.tap();
          ripples(e.x, e.y);
        }
      });
    return Gesture.Race(pan, tap);
  }, [ctl, motion, dotX, dotY, dotShown, hintShown]);

  const hintStyle = useAnimatedStyle(() => ({ opacity: hintShown.value }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={gesture}>
        <AnimatedBox
          flex={1}
          bg="surface"
          border="line"
          radius="lg"
          shadow="card"
          align="center"
          justify="center"
          testID="tv-touchpad"
          accessibilityLabel={t('tv.touchpadLabel')}
          animatedStyle={enter}
        >
          <PadLayers>
            <DotGrid />
            <TouchDot x={dotX} y={dotY} visible={dotShown} />
            <TapRipple x={ripple.x} y={ripple.y} trigger={ripple.n} />
          </PadLayers>
          <AnimatedBox animatedStyle={hintStyle} px={6} align="center">
            <Txt variant="label" weight="regular" color="ink2" align="center">
              {t('tv.touchpadHint')}
            </Txt>
          </AnimatedBox>
        </AnimatedBox>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
