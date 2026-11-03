import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Button, Column, Txt } from '@/ui';
import { PanelArt } from './TvOffPanel';

export function UnreachablePanel(props: {
  onWifiSettings: () => void;
  onFindAgain: () => void;
  busy?: boolean;
  note?: { text: string; ok: boolean } | null;
}): ReactElement {
  return (
    <Column flex={1} gap={3} align="center" justify="center" px={4} testID="tv-unreachable">
      <PanelArt icon="wifioff" tone="warm" />
      <Txt variant="heading">{t('tv.unreachableTitle')}</Txt>
      <Txt color="ink2">{t('tv.unreachableBody')}</Txt>
      <Column gap={2} w="100%">
        <Button
          label={t('tv.findAgain')}
          onPress={props.onFindAgain}
          loading={props.busy === true}
        />
        <Button label={t('tv.wifiSettings')} variant="secondary" onPress={props.onWifiSettings} />
      </Column>
      {props.note ? (
        <Box accessibilityRole={props.note.ok ? undefined : 'alert'}>
          <Txt
            live={props.note.ok}
            variant="bodyBold"
            color={props.note.ok ? 'okInk' : 'dangerInk'}
          >
            {props.note.text}
          </Txt>
        </Box>
      ) : null}
    </Column>
  );
}
