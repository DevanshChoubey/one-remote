import type { ReactElement } from 'react';
import type { TvKey } from '@/core';
import { t } from '@/i18n';
import { Row, Txt } from '@/ui';
import { KeyButton } from './KeyButton';

export function VolumeRocker(props: { onKey: (k: TvKey) => void }): ReactElement {
  return (
    <Row gap={3} align="center" justify="center">
      <KeyButton label={t('tv.volumeDown')} glyph="－" onPress={() => props.onKey('volumeDown')} />
      <Txt variant="bodyBold" color="ink2">
        {t('tv.volume')}
      </Txt>
      <KeyButton label={t('tv.volumeUp')} glyph="＋" onPress={() => props.onKey('volumeUp')} />
    </Row>
  );
}
