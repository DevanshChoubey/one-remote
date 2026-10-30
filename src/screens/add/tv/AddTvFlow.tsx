import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import type { Device, FoundTv, PairedTv } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Screen, Txt } from '@/ui';
import { NameRoomStep } from '../NameRoomStep';
import { FindTvStep } from './FindTvStep';
import { ManualIpStep } from './ManualIpStep';
import { PairTvStep } from './PairTvStep';
import { TvBrandStep } from './TvBrandStep';

type Step =
  | { name: 'brand' }
  | { name: 'find' }
  | { name: 'manual' }
  | { name: 'pair'; tv: FoundTv }
  | { name: 'duplicate'; existing: Device }
  | { name: 'name'; paired: PairedTv; withIr: boolean };

/** Brand, find, pair, then name and room. Nothing is saved until the last step. */
export function AddTvFlow(): ReactElement {
  const router = useRouter();
  const { store, secrets, drivers } = useServices();
  const [step, setStep] = useState<Step>({ name: 'brand' });

  const onPaired = useCallback(
    (paired: PairedTv): void => {
      const mac = paired.link.mac;
      store.devices().then(
        (all) => {
          const existing =
            mac === undefined
              ? undefined
              : all.find((d) => d.links.some((l) => l.kind === 'webos' && l.mac === mac));
          if (existing) {
            // The pairing made a new key for a TV we already have: drop it, keep the old one.
            const keep = existing.links.some(
              (l) => l.kind === 'webos' && l.clientKeyRef === paired.link.clientKeyRef,
            );
            if (!keep) {
              secrets
                .delete(paired.link.clientKeyRef)
                .catch((e: unknown) => console.error('Could not drop the new key', e));
            }
            setStep({ name: 'duplicate', existing });
            return;
          }
          const withIr = drivers.some((d) => d.kind === 'ir' && d.available());
          setStep({ name: 'name', paired, withIr });
        },
        (e: unknown) => console.error('Could not read the home', e),
      );
    },
    [store, secrets, drivers],
  );

  switch (step.name) {
    case 'brand':
      return <TvBrandStep onLg={() => setStep({ name: 'find' })} />;
    case 'find':
      return (
        <FindTvStep
          onPick={(tv) => setStep({ name: 'pair', tv })}
          onManual={() => setStep({ name: 'manual' })}
          onBack={() => setStep({ name: 'brand' })}
        />
      );
    case 'manual':
      return (
        <ManualIpStep
          onFound={(tv) => setStep({ name: 'pair', tv })}
          onBack={() => setStep({ name: 'find' })}
        />
      );
    case 'pair':
      return (
        <PairTvStep
          key={step.tv.host}
          tv={step.tv}
          onPaired={onPaired}
          onBack={() => setStep({ name: 'find' })}
        />
      );
    case 'duplicate':
      return (
        <Screen title={t('addTv.title')} onBack={() => setStep({ name: 'find' })}>
          <Column gap={4}>
            <Txt>{t('addTv.duplicate', { name: step.existing.name })}</Txt>
            <Button
              label={t('addTv.openIt')}
              onPress={() => router.replace(`/device/${step.existing.id}`)}
            />
          </Column>
        </Screen>
      );
    case 'name':
      return (
        <NameRoomStep
          draft={{
            kind: 'tv',
            links: step.withIr
              ? [step.paired.link, { kind: 'ir', remoteId: 'lg-tv/nec' }]
              : [step.paired.link],
          }}
          suggestedName={step.paired.suggestedName}
          onDone={() => router.dismissAll()}
          onBack={() => setStep({ name: 'find' })}
        />
      );
  }
}
