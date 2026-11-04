import type { ReactElement, ReactNode } from 'react';
import { t } from '@/i18n';
import type { ColorToken } from '@/theme';
import { Box, Button, Column, Icon, Spacer, Spinner, Txt } from '@/ui';
import type { IconName } from '@/ui';
import { PanelFade } from '@/ui/tv';

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

/**
 * The mock's `.tv-panel`: centred, text centred, 12 px apart, with the art 8 px further from the
 * title. Each state spaces its own parts (the gaps differ), so the column itself has no gap.
 */
export function TvPanel(props: {
  icon: IconName;
  tone: ColorToken;
  title: string;
  testID: string;
  children: ReactNode;
}): ReactElement {
  return (
    <PanelFade>
      <Column flex={1} align="center" justify="center" px={4} testID={props.testID}>
        <PanelArt icon={props.icon} tone={props.tone} />
        <Spacer size={5} />
        <Txt variant="heading" align="center">
          {props.title}
        </Txt>
        <Spacer size={3} />
        {props.children}
      </Column>
    </PanelFade>
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
    <TvPanel icon="power" tone="ink2" title={t('tv.offTitle')} testID="tv-off">
      {props.mode === 'waking' ? (
        <>
          <Txt live color="ink2" align="center">
            {t('tv.waking')}
          </Txt>
          {/* 12 px gap and the spinner wrapper's 8 px margin. */}
          <Spacer size={5} />
          <Spinner size="lg" />
        </>
      ) : !props.canTurnOn ? (
        <>
          <Txt color="ink2" align="center">
            {t('tv.offBody')}
          </Txt>
          <Spacer size={3} />
          <Txt live color="ink2" align="center">
            {t('tv.cantTurnOn')}
          </Txt>
        </>
      ) : (
        <>
          <Txt color="ink2" align="center">
            {t('tv.offBody')}
          </Txt>
          {/* 12 px gap and the button's 4 px margin. */}
          <Spacer size={4} />
          <Button label={t('tv.turnOn')} onPress={props.onTurnOn} />
          <Spacer size={3} />
          <Txt variant="caption" color="ink2" align="center">
            {t('tv.offHint')}
          </Txt>
          {props.mode === 'wakeFailed' ? (
            <>
              <Spacer size={5} />
              {/* The mock sets this longer hint left-aligned. */}
              <Txt live color="ink2" align="left">
                {t(props.wakeHintKey)}
              </Txt>
            </>
          ) : null}
        </>
      )}
    </TvPanel>
  );
}
