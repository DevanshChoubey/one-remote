import type { ReactElement } from 'react';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { AnimatedBox, Box, Column } from '@/ui';
import { usePadEnter } from '@/ui/tv';
import { KeyButton } from './KeyButton';

const RING = 300;
const INSET = 6;
const KEY = 84;
const EDGE = (RING - KEY) / 2;
const OK = 100;
const OK_EDGE = (RING - OK) / 2;

export function DPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const { onKey } = props;
  const enter = usePadEnter();
  return (
    <AnimatedBox flex={1} align="center" justify="center" animatedStyle={enter} testID="tv-dpad">
      <Column align="center" justify="center">
        <Box w={RING} h={RING} bg="surface" border="line" radius="pill" shadow="card">
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
