import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { aerProblem } from '@/services';
import type { FoundAer } from '@/services';
import { Box, Button, Column, EmptyState, OptionCard, Row, Screen, Spinner, Txt } from '@/ui';
import { Radar } from '@/ui/addtv';
import { problemCopy } from '../../aer/format';
import { useAerScan } from './useAerScan';

const CLOSE_DBM = -60;
const NEAR_DBM = -80;

/** How close a device is, in words. */
export function signalLabel(rssi: number | null): string {
  if (rssi !== null && rssi >= CLOSE_DBM) return t('aer.signalClose');
  if (rssi !== null && rssi >= NEAR_DBM) return t('aer.signalNear');
  return t('aer.signalFar');
}

export interface ScanStepProps {
  onPick: (found: FoundAer) => void;
  onBack: () => void;
  openBluetoothSettings: () => void;
}

/** Lists the air fresheners in range as the scan finds them; the scan stops when the step is left. */
export function ScanStep(props: ScanStepProps): ReactElement {
  const scan = useAerScan();
  const problem = scan.status === 'error' ? aerProblem(scan.error) : null;

  if (problem !== null) {
    const off = problem === 'btoff';
    const denied = problem === 'denied';
    return (
      <Screen onBack={props.onBack}>
        <EmptyState
          art="btoff"
          fill
          title={off ? t('aer.btOffTitle') : denied ? t('aer.deniedTitle') : t('aer.lookingTitle')}
          body={
            off ? t('aer.btOffBody') : denied ? t('aer.deniedBody') : problemCopy(scan.error).line
          }
          action={
            <Column gap={2}>
              {off || denied ? (
                <Button label={t('aer.openSettings')} onPress={props.openBluetoothSettings} />
              ) : null}
              <Button
                label={t('aer.tryAgain')}
                variant={off || denied ? 'secondary' : 'primary'}
                onPress={scan.start}
              />
            </Column>
          }
        />
      </Screen>
    );
  }

  const none = scan.devices.length === 0;
  return (
    <Screen
      title={t('aer.lookingTitle')}
      subtitle={t('aer.lookingBody')}
      largeTitle
      onBack={props.onBack}
      scroll
      footer={
        scan.showHelp ? (
          <Button label={t('aer.lookAgain')} variant="secondary" onPress={scan.start} />
        ) : scan.status === 'done' ? null : (
          <Row gap={2} align="center" justify="center">
            {none ? null : <Spinner size="xs" color="ink2" />}
            <Txt variant="caption" color="ink2" live>
              {none ? t('aer.looking') : t('aer.stillLooking')}
            </Txt>
          </Row>
        )
      }
    >
      <Box align="center" py={2}>
        <Radar searching={scan.status === 'scanning' && !scan.showHelp} icon="bt" />
      </Box>
      {scan.showHelp ? (
        <Txt color="ink2" align="center" live>
          {t('aer.nothingYet')}
        </Txt>
      ) : null}
      <Column gap={2}>
        {scan.devices.map((d) => (
          <OptionCard
            key={d.bleId}
            icon="bt"
            title={d.name ?? t('aer.unnamed')}
            subtitle={signalLabel(d.rssi)}
            onPress={() => props.onPick(d)}
            testID={`aer-found-${d.bleId}`}
          />
        ))}
      </Column>
    </Screen>
  );
}
