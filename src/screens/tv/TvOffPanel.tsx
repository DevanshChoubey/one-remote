import type { ReactElement } from 'react';
import { t } from '@/i18n';
import type { ColorToken } from '@/theme';
import { Box, Button, Column, Icon, Spinner, Txt } from '@/ui';
import type { IconName } from '@/ui';

/** The 96 px art tile of the TV's whole-screen states. */
export function PanelArt(props: { icon: IconName; tone: ColorToken }): ReactElement {
  return (
    <Box
      w={96}
      h={96}
      radius="art"
      bg="surface"
      border="line"
      shadow="card"
      align="center"
      justify="center"
    >
      <Icon name={props.icon} size={44} strokeWidth={1.7} color={props.tone} />
    </Box>
  );
}

export function TvOffPanel(props: {
  mode: 'off' | 'waking' | 'wakeFailed';
  onTurnOn: () => void;
  /** False when the phone cannot wake this TV (no MAC, no IR). */
  canTurnOn: boolean;
  wakeHintKey: string;
}): ReactElement {
  return (
    <Column flex={1} gap={3} align="center" justify="center" px={4} testID="tv-off">
      <PanelArt icon="power" tone={props.mode === 'wakeFailed' ? 'warm' : 'ink2'} />
      <Txt variant="heading">{t('tv.offTitle')}</Txt>
      {props.mode === 'waking' ? (
        <>
          <Txt live color="ink2">
            {t('tv.waking')}
          </Txt>
          <Spinner size="lg" />
        </>
      ) : !props.canTurnOn ? (
        <>
          <Txt color="ink2">{t('tv.offBody')}</Txt>
          <Txt live color="ink2">
            {t('tv.cantTurnOn')}
          </Txt>
        </>
      ) : (
        <>
          <Txt color="ink2">{t('tv.offBody')}</Txt>
          <Button label={t('tv.turnOn')} onPress={props.onTurnOn} />
          <Txt variant="caption" color="ink2">
            {t('tv.offHint')}
          </Txt>
          {props.mode === 'wakeFailed' ? (
            <Txt live color="ink2">
              {t(props.wakeHintKey)}
            </Txt>
          ) : null}
        </>
      )}
    </Column>
  );
}
