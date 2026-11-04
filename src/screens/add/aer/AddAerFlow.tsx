import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { EmptyState, Screen } from '@/ui';
import { newId } from '../../shared/newId';
import { NameRoomStep } from '../NameRoomStep';
import { planNewDevice } from '../newDevice';
import type { NamePick } from '../newDevice';
import { BlinkStep } from './BlinkStep';
import type { BlinkTarget } from './BlinkStep';
import { ScanStep } from './ScanStep';
import { ZoneStep } from './ZoneStep';

export interface AddAerFlowProps {
  /** Opens the phone's Bluetooth (or this app's) settings; W.1 wires the real one. */
  openBluetoothSettings?: () => void;
}

type Step =
  | { name: 'scan' }
  | { name: 'blink'; target: BlinkTarget }
  | { name: 'name'; target: BlinkTarget }
  | { name: 'zone'; target: BlinkTarget; pick: NamePick };

const NOTHING = (): void => {};

/** Add an air freshener: find it nearby, blink it, then (E.3) name it and set its time zone. */
export function AddAerFlow(props: AddAerFlowProps): ReactElement {
  const router = useRouter();
  const { aer, store } = useServices();
  const [step, setStep] = useState<Step>({ name: 'scan' });
  /** Room first (the add needs it), then the device; a failed add takes the new room back out. */
  const save = async (target: BlinkTarget, pick: NamePick, timeZone: string): Promise<void> => {
    const [rooms, devices] = await Promise.all([store.rooms(), store.devices()]);
    const draft = {
      kind: 'aer' as const,
      links: [{ kind: 'aer' as const, bleId: target.bleId, timeZone }],
    };
    const { device, newRoom } = planNewDevice({ rooms, devices }, draft, pick, target.deviceId);
    if (newRoom) await store.upsertRoom(newRoom);
    try {
      await aer.add(device);
    } catch (e) {
      if (newRoom) await store.removeRoom(newRoom.id).catch(() => undefined);
      throw e;
    }
    router.dismissAll();
  };
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
      return (
        <NameRoomStep
          draft={{ kind: 'aer', links: [] }}
          suggestedName={t('aer.defaultName')}
          stepLabel={t('aer.nameStep')}
          onBack={() => setStep({ name: 'blink', target: step.target })}
          onNext={(pick) => setStep({ name: 'zone', target: step.target, pick })}
          onDone={NOTHING}
        />
      );
    case 'zone':
      return (
        <ZoneStep
          deviceId={step.target.deviceId}
          onBack={() => setStep({ name: 'name', target: step.target })}
          onDone={(timeZone) => save(step.target, step.pick, timeZone)}
        />
      );
  }
}
