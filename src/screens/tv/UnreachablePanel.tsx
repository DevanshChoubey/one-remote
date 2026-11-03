import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, Txt } from '@/ui';
import { PanelArt } from './TvOffPanel';

export function UnreachablePanel(props: {
  onWifiSettings: () => void;
  onFindAgain: () => void;
  busy?: boolean;
  note?: string | null;
}): ReactElement {
  return (
    <Column gap={3} align="center" p={6} testID="tv-unreachable">
      <PanelArt icon="wifioff" tone="warm" />
      <Txt variant="heading">{t('tv.unreachableTitle')}</Txt>
      <Txt color="ink2">{t('tv.unreachableBody')}</Txt>
      <Column gap={2}>
        <Button
          label={t('tv.findAgain')}
          onPress={props.onFindAgain}
          loading={props.busy === true}
        />
        <Button label={t('tv.wifiSettings')} variant="secondary" onPress={props.onWifiSettings} />
      </Column>
      {props.note ? (
        <Txt live color="ink2">
          {props.note}
        </Txt>
      ) : null}
    </Column>
  );
}
