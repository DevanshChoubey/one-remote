import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { Box, Txt } from '@/ui';
import { createPadController } from './touchpad';

const PAD_HEIGHT = 280;
const TAP_MS = 250;

/** A pan surface that turns swipes into arrow keys and a tap into OK. */
export function TouchPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const ctl = useMemo(() => createPadController(), []);
  useEffect(() => {
    ctl.setHandler(props.onKey);
  }, [ctl, props.onKey]);
  useEffect(() => ctl.stop, [ctl]);

  // A pan for moves and a tap for OK. Pan needs a few pixels of travel to win over the tap, and
  // a pan that never activates (a still tap on iPhone) is cancelled and sends nothing itself.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
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
    <GestureHandlerRootView style={{ height: PAD_HEIGHT }}>
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
