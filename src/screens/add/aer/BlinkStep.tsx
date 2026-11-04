import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { aerProblem, useServices } from '@/services';
import { Button, Column, ErrorLine, ResultDisc, Row, Screen, Spinner, Txt, useToast } from '@/ui';
import { BlinkArt } from '@/ui/aer';
import { problemCopy } from '../../aer/format';
import { phoneZone } from './phoneZone';

export interface BlinkTarget {
  bleId: string;
  name: string;
  /** The id the device will have once added; the blink session is keyed by it. */
  deviceId: string;
}

export interface BlinkStepProps {
  target: BlinkTarget;
  /** The one that blinked is the one to add. */
  onYes: () => void;
  /** Back to the list; the scan starts over. */
  onChooseAnother: () => void;
}

type Phase = { name: 'connect' } | { name: 'ask' } | { name: 'problem'; error: unknown };

/** Asks the picked device to blink its light, then asks whether that was the one. */
export function BlinkStep(props: BlinkStepProps): ReactElement {
  const { aer } = useServices();
  const toast = useToast();
  const { bleId, name, deviceId } = props.target;
  const [phase, setPhase] = useState<Phase>({ name: 'connect' });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** One blink; the screen only moves while it is still showing. */
  const send = useCallback(
    (again: boolean): void => {
      aer.blink(deviceId, { bleId, timeZone: phoneZone() }).then(
        () => {
          if (!alive.current) return;
          setPhase({ name: 'ask' });
          if (again) toast.show(t('aer.blinkToast'));
        },
        (e: unknown) => {
          if (alive.current) setPhase({ name: 'problem', error: e });
        },
      );
    },
    [aer, bleId, deviceId, toast],
  );

  useEffect(() => {
    send(false);
  }, [send]);

  /** Try again: back to "Blinking its light…", then one more blink. */
  const retry = (): void => {
    setPhase({ name: 'connect' });
    send(false);
  };

  if (phase.name === 'problem' && aerProblem(phase.error) === 'notAer') {
    return (
      <Screen bare onBack={props.onChooseAnother}>
        <Column flex={1} align="center" justify="center" gap={5} px={4}>
          <ResultDisc kind="bad" label={t('aer.notAerLabel')} />
          <Column gap={3} align="center">
            <Txt variant="heading" align="center">
              {t('aer.notAerTitle')}
            </Txt>
            <Txt color="ink2" align="center">
              {t('aer.notAerBody')}
            </Txt>
          </Column>
        </Column>
        <Button label={t('aer.chooseAnother')} onPress={props.onChooseAnother} />
      </Screen>
    );
  }

  if (phase.name === 'problem') {
    return (
      <Screen
        title={t('aer.checkTitle')}
        largeTitle
        onBack={props.onChooseAnother}
        footer={
          <Column gap={2}>
            <Button label={t('aer.tryAgain')} onPress={retry} />
            <Button
              label={t('aer.chooseAnother')}
              variant="ghost"
              onPress={props.onChooseAnother}
            />
          </Column>
        }
      >
        <BlinkArt on={false} />
        <ErrorLine text={problemCopy(phase.error).line} />
      </Screen>
    );
  }

  if (phase.name === 'connect') {
    return (
      <Screen title={t('aer.checkTitle')} subtitle={name} largeTitle onBack={props.onChooseAnother}>
        <BlinkArt on={false} />
        <Row gap={2} align="center" justify="center">
          <Spinner size="xs" color="ink2" />
          <Txt color="ink2" align="center" live>
            {t('aer.blinking')}
          </Txt>
        </Row>
      </Screen>
    );
  }

  return (
    <Screen
      title={t('aer.askTitle')}
      subtitle={t('aer.askBody')}
      largeTitle
      onBack={props.onChooseAnother}
      footer={
        <Column gap={2}>
          <Button label={t('aer.yesThatOne')} onPress={props.onYes} />
          <Button label={t('aer.blinkAgain')} variant="secondary" onPress={() => send(true)} />
          <Button
            label={t('aer.noChooseAnother')}
            variant="ghost"
            onPress={props.onChooseAnother}
          />
        </Column>
      }
    >
      <BlinkArt on />
    </Screen>
  );
}
