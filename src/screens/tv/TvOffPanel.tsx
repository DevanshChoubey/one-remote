import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, Txt } from '@/ui';

export function TvOffPanel(props: {
  mode: 'off' | 'waking' | 'wakeFailed';
  onTurnOn: () => void;
}): ReactElement {
  return (
    <Column gap={3} align="center" testID="tv-off">
      <Txt variant="heading">{t('tv.offTitle')}</Txt>
      {props.mode === 'waking' ? (
        <Txt live color="ink2">
          {t('tv.waking')}
        </Txt>
      ) : (
        <>
          <Txt color="ink2">{t('tv.offBody')}</Txt>
          <Button label={t('tv.turnOn')} onPress={props.onTurnOn} />
          <Txt variant="caption" color="ink2">
            {t('tv.offHint')}
          </Txt>
          {props.mode === 'wakeFailed' ? (
            <Txt live color="ink2">
              {t('tv.wakeFailed')}
            </Txt>
          ) : null}
        </>
      )}
    </Column>
  );
}
