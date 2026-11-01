import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { Box, Txt } from '@/ui';
import { createPadController } from './touchpad';

// The TV screen does not scroll (a scroll view takes up and down swipes from the pad), so the pad
// takes about a third of the window, within these bounds, to leave room for the keys.
const PAD_MAX = 280;
const PAD_MIN = 140;
const TAP_MS = 250;

/** A pan surface that turns swipes into arrow keys and a tap into OK. */
export function TouchPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const ctl = useMemo(() => createPadController(), []);
  const { height } = useWindowDimensions();
  const padHeight = Math.round(Math.min(PAD_MAX, Math.max(PAD_MIN, height * 0.3)));
  useEffect(() => {
    ctl.setHandler(props.onKey);
  }, [ctl, props.onKey]);
  useEffect(() => ctl.stop, [ctl]);

  // A pan for moves and a tap for OK. The pad sits in a scrolling screen, so on Android the pan
  // takes the touch at once: waiting for travel lets the screen claim every up or down swipe as a
  // scroll. There the pan always wins and a still touch ends as OK (see `end`). On iPhone a pan with
  // no travel never activates, so it keeps the default travel and a still tap goes to the tap.
  const gesture = useMemo(() => {
    const base = Gesture.Pan().runOnJS(true);
    const pan = (Platform.OS === 'android' ? base.minDistance(0) : base)
      .onBegin((e) => ctl.begin(e.x, e.y))
      .onUpdate((e) => ctl.update(e.x, e.y))
      .onFinalize((e, success) => (success ? ctl.finish(e.x, e.y) : ctl.cancel()));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(TAP_MS)
      .onEnd((_e, success) => {
        if (success) ctl.tap();
      });
    return Gesture.Race(pan, tap);
  }, [ctl]);

  return (
    <GestureHandlerRootView style={{ height: padHeight }}>
      <GestureDetector gesture={gesture}>
        <Box
          flex={1}
          bg="surface2"
          border="line"
          radius="lg"
          align="center"
          justify="center"
          testID="tv-touchpad"
          accessibilityLabel={t('tv.touchpadLabel')}
        >
          <Txt color="ink2">{t('tv.touchpadHint')}</Txt>
        </Box>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}
