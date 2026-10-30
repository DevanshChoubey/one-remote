import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { Box, Txt } from '@/ui';
import { createPadController } from './touchpad';

const PAD_HEIGHT = 280;

/** A pan surface that turns swipes into arrow keys and a tap into OK. */
export function TouchPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const ctl = useMemo(() => createPadController(), []);
  useEffect(() => {
    ctl.setHandler(props.onKey);
  }, [ctl, props.onKey]);
  useEffect(() => ctl.stop, [ctl]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .onBegin((e) => ctl.begin(e.x, e.y))
        .onUpdate((e) => ctl.update(e.x, e.y))
        .onFinalize((e) => ctl.finish(e.x, e.y)),
    [ctl],
  );

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
