import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { EmptyState, Screen } from '@/ui';
import { newId } from '../../shared/newId';
import { BlinkStep } from './BlinkStep';
import type { BlinkTarget } from './BlinkStep';
import { ScanStep } from './ScanStep';

export interface AddAerFlowProps {
  /** Opens the phone's Bluetooth (or this app's) settings; W.1 wires the real one. */
  openBluetoothSettings?: () => void;
}

type Step =
  { name: 'scan' } | { name: 'blink'; target: BlinkTarget } | { name: 'name'; target: BlinkTarget };

const NOTHING = (): void => {};

/** Add an air freshener: find it nearby, blink it, then (E.3) name it and set its time zone. */
export function AddAerFlow(props: AddAerFlowProps): ReactElement {
  const router = useRouter();
  const { aer } = useServices();
  const [step, setStep] = useState<Step>({ name: 'scan' });
  if (!aer.supported()) {
    return (
      <Screen onBack={() => router.back()}>
        <EmptyState art="aer" fill title={t('add.kindAer')} body={t('add.needsAndroid12')} />
      </Screen>
    );
  }
  switch (step.name) {
    case 'scan':
      return (
        <ScanStep
          onBack={() => router.back()}
          openBluetoothSettings={props.openBluetoothSettings ?? NOTHING}
          onPick={(found) =>
            setStep({
              name: 'blink',
              target: {
                bleId: found.bleId,
                name: found.name ?? t('aer.unnamed'),
                deviceId: newId(),
              },
            })
          }
        />
      );
    case 'blink':
      return (
        <BlinkStep
          key={step.target.deviceId}
          target={step.target}
          onYes={() => setStep({ name: 'name', target: step.target })}
          onChooseAnother={() => setStep({ name: 'scan' })}
        />
      );
    case 'name':
      // Task E.3 fills this in: the name, then the time zone.
      return <Screen onBack={() => setStep({ name: 'blink', target: step.target })}>{null}</Screen>;
  }
}
