import type { ReactElement } from 'react';
import { useWindowDimensions } from 'react-native';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { AnimatedBox, Box, Column } from '@/ui';
import { usePadEnter } from '@/ui/tv';
import { KeyButton } from './KeyButton';
/** The mock's ring is 300; it shrinks on a phone narrower than 332 dp, down to 252. */
/** The mock's ring is 300; it shrinks on a narrow phone (360 dp less the screen's gutters) to 252. */
const RING_MAX = 300;
const RING_MIN = 252;
const GUTTER = 32;
const INSET = 6;
const KEY_MAX = 84;
const OK_MAX = 100;

export function DPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const { onKey } = props;
  const enter = usePadEnter();
  const { width } = useWindowDimensions();
  const RING = Math.min(RING_MAX, Math.max(RING_MIN, width - GUTTER));
  // The keys shrink with the ring so they never overlap the OK key.
  const scale = RING / RING_MAX;
  const KEY = Math.round(KEY_MAX * scale);
  const OK = Math.round(OK_MAX * scale);
  const EDGE = (RING - KEY) / 2;
  const OK_EDGE = (RING - OK) / 2;
  return (
    <AnimatedBox flex={1} align="center" justify="center" animatedStyle={enter} testID="tv-dpad">
      <Column align="center" justify="center">
        <Box
          w={RING}
          h={RING}
          bg="surface"
          border="line"
          radius="pill"
          shadow="card"
          testID="tv-dpad-ring"
        >
          <Box float={{ top: INSET, left: EDGE }}>
            <KeyButton label={t('tv.up')} icon="up" size={KEY} flat onPress={() => onKey('up')} />
          </Box>
          <Box float={{ bottom: INSET, left: EDGE }}>
            <KeyButton
              label={t('tv.down')}
              icon="down"
              size={KEY}
              flat
              onPress={() => onKey('down')}
            />
          </Box>
          <Box float={{ left: INSET, top: EDGE }}>
            <KeyButton
              label={t('tv.left')}
              icon="left"
              size={KEY}
              flat
              onPress={() => onKey('left')}
            />
          </Box>
          <Box float={{ right: INSET, top: EDGE }}>
            <KeyButton
              label={t('tv.right')}
              icon="right"
              size={KEY}
              flat
              onPress={() => onKey('right')}
            />
          </Box>
          <Box float={{ left: OK_EDGE, top: OK_EDGE }}>
            <KeyButton
              label={t('tv.ok')}
              icon="check"
              size={OK}
              tone="accent"
              text="OK"
              onPress={() => onKey('ok')}
            />
          </Box>
        </Box>
      </Column>
    </AnimatedBox>
  );
}
