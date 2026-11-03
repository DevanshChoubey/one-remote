import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Button, Column, Spacer, Txt } from '@/ui';
import { TvPanel } from './TvOffPanel';

export function UnreachablePanel(props: {
  onWifiSettings: () => void;
  onFindAgain: () => void;
  busy?: boolean;
  note?: { text: string; ok: boolean } | null;
}): ReactElement {
  const busy = props.busy === true;
  return (
    <TvPanel icon="wifioff" tone="warm" title={t('tv.unreachableTitle')} testID="tv-unreachable">
      <Txt color="ink2" align="center">
        {t('tv.unreachableBody')}
      </Txt>
      {/* 12 px gap and the button stack's 12 px margin. */}
      <Spacer size={6} />
      <Column gap={2} w="100%">
        <Button label={t('tv.findAgain')} onPress={props.onFindAgain} loading={busy} />
        <Button label={t('tv.wifiSettings')} variant="secondary" onPress={props.onWifiSettings} />
      </Column>
      {busy ? (
        <>
          <Spacer size={3} />
          <Txt live variant="caption" color="ink2" align="center">
            {t('tv.finding')}
          </Txt>
        </>
      ) : props.note ? (
        <>
          <Spacer size={3} />
          <Box accessibilityRole={props.note.ok ? undefined : 'alert'}>
            <Txt
              live={props.note.ok}
              variant="bodyBold"
              color={props.note.ok ? 'okInk' : 'dangerInk'}
              align="center"
            >
              {props.note.text}
            </Txt>
          </Box>
        </>
      ) : null}
    </TvPanel>
  );
}
