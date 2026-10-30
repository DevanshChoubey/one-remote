import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, Txt } from '@/ui';

export function UnreachablePanel(props: {
  onWifiSettings: () => void;
  onFindAgain: () => void;
  busy?: boolean;
  note?: string | null;
}): ReactElement {
  return (
    <Column gap={3} align="center" testID="tv-unreachable">
      <Txt variant="heading">{t('tv.unreachableTitle')}</Txt>
      <Txt color="ink2">{t('tv.unreachableBody')}</Txt>
      <Button label={t('tv.wifiSettings')} variant="secondary" onPress={props.onWifiSettings} />
      <Button label={t('tv.findAgain')} onPress={props.onFindAgain} loading={props.busy === true} />
      {props.note ? (
        <Txt live color="ink2">
          {props.note}
        </Txt>
      ) : null}
    </Column>
  );
}
