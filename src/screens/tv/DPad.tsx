import type { ReactElement } from 'react';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { Box, Column, Row } from '@/ui';
import { KeyButton } from './KeyButton';

export function DPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const { onKey } = props;
  return (
    <Column flex={1} gap={3} align="center" justify="center">
      <KeyButton label={t('tv.up')} icon="up" size={84} onPress={() => onKey('up')} />
      <Row gap={3} align="center">
        <KeyButton label={t('tv.left')} icon="left" size={84} onPress={() => onKey('left')} />
        <Box>
          <KeyButton
            label={t('tv.ok')}
            icon="check"
            size={84}
            tone="accent"
            text="OK"
            onPress={() => onKey('ok')}
          />
        </Box>
        <KeyButton label={t('tv.right')} icon="right" size={84} onPress={() => onKey('right')} />
      </Row>
      <KeyButton label={t('tv.down')} icon="down" size={84} onPress={() => onKey('down')} />
    </Column>
  );
}
