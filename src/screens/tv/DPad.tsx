import type { ReactElement } from 'react';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { Box, Column, Row } from '@/ui';
import { KeyButton } from './KeyButton';

export function DPad(props: { onKey: (k: TvKey) => void }): ReactElement {
  const { onKey } = props;
  return (
    <Column flex={1} gap={3} align="center" justify="center">
      <KeyButton label={t('tv.up')} glyph="▲" onPress={() => onKey('up')} />
      <Row gap={3} align="center">
        <KeyButton label={t('tv.left')} glyph="◀" onPress={() => onKey('left')} />
        <Box>
          <KeyButton label={t('tv.ok')} glyph="OK" round primary onPress={() => onKey('ok')} />
        </Box>
        <KeyButton label={t('tv.right')} glyph="▶" onPress={() => onKey('right')} />
      </Row>
      <KeyButton label={t('tv.down')} glyph="▼" onPress={() => onKey('down')} />
    </Column>
  );
}
