import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { MiraieError, miraieLinkOf } from '@/core';
import type { MiraieAc, MiraieLink } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, EmptyState, OptionCard, Screen, SkelCard, Txt } from '@/ui';
import { useHomeData } from '../../shared/useHomeData';

export interface MiraieStepProps {
  /** An IR backup can be added on this phone: ask, after the AC is picked. */
  canBackup: boolean;
  /** The AC was picked; `backup`: the person wants the IR test next. */
  onDone(link: MiraieLink, backup: boolean): void;
  onBack(): void;
}

type Phase =
  | { name: 'loading' }
  | { name: 'list'; acs: MiraieAc[] }
  | { name: 'failed'; code: MiraieError['code'] }
  | { name: 'backup'; link: MiraieLink };

/** Mock `addMiraie` and `addMiraieBackup`: the ACs of the MirAIe account, then the IR backup offer. */
export function MiraieStep(props: MiraieStepProps): ReactElement {
  const { miraie } = useServices();
  const router = useRouter();
  const data = useHomeData();
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [picked, setPicked] = useState<string | null>(null);
  const run = useRef(0);

  // Asks MirAIe; only the latest ask may set the phase, and none after leaving.
  const fetchList = useCallback(
    (mine: number): void => {
      miraie.listAcs().then(
        (acs) => {
          if (mine === run.current) setPhase({ name: 'list', acs });
        },
        (e: unknown) => {
          if (mine !== run.current) return;
          setPhase({ name: 'failed', code: e instanceof MiraieError ? e.code : 'offline' });
        },
      );
    },
    [miraie],
  );
  const load = (): void => {
    setPhase({ name: 'loading' });
    fetchList(++run.current);
  };
  useEffect(() => {
    const counter = run;
    fetchList(++counter.current);
    return () => {
      counter.current++;
    };
  }, [fetchList]);

  const added = new Set(
    data.devices.flatMap((d) => d.links.flatMap((l) => (l.kind === 'miraie' ? [l.deviceId] : []))),
  );

  if (phase.name === 'backup') {
    return (
      <Screen
        title={t('miraie.backupTitle')}
        largeTitle
        onBack={() => setPhase({ name: 'loading' })}
      >
        <Column gap={3}>
          <Txt color="ink2">{t('miraie.backupSub')}</Txt>
          <Txt>{t('miraie.backupBody')}</Txt>
          <Button label={t('miraie.backupAdd')} onPress={() => props.onDone(phase.link, true)} />
          <Button
            label={t('miraie.backupSkip')}
            variant="ghost"
            onPress={() => props.onDone(phase.link, false)}
          />
        </Column>
      </Screen>
    );
  }

  const title = t('miraie.listTitle');
  if (phase.name === 'loading') {
    return (
      <Screen title={title} largeTitle onBack={props.onBack}>
        <Column gap={3}>
          <Txt color="ink2" live>
            {t('miraie.listLoading')}
          </Txt>
          <SkelCard />
          <SkelCard />
        </Column>
      </Screen>
    );
  }
  if (phase.name === 'failed') {
    const signedOut = phase.code === 'signedOut' || phase.code === 'off';
    return (
      <Screen title={title} largeTitle onBack={props.onBack}>
        <EmptyState
          art="alert"
          tone="warm"
          title={t(signedOut ? 'miraie.listSignedOut' : 'miraie.listError')}
          body={t(signedOut ? 'miraie.listSignedOutBody' : 'miraie.listErrorBody')}
          action={
            signedOut ? (
              <Button label={t('miraie.openSettings')} onPress={() => router.push('/settings')} />
            ) : (
              <Button label={t('miraie.tryAgain')} onPress={load} />
            )
          }
        />
      </Screen>
    );
  }
  if (phase.acs.length === 0) {
    return (
      <Screen title={title} largeTitle onBack={props.onBack}>
        <EmptyState
          art="ac"
          title={t('miraie.listEmpty')}
          body={t('miraie.listEmptyBody')}
          action={<Button label={t('miraie.lookAgain')} variant="secondary" onPress={load} />}
        />
      </Screen>
    );
  }

  const free = phase.acs.filter((a) => !added.has(a.deviceId));
  const chosen = free.find((a) => a.deviceId === picked) ?? free[0];
  const next = (): void => {
    if (!chosen) return;
    const link = miraieLinkOf(chosen);
    if (props.canBackup) setPhase({ name: 'backup', link });
    else props.onDone(link, false);
  };
  return (
    <Screen title={title} largeTitle onBack={props.onBack} scroll>
      <Column gap={3}>
        <Txt color="ink2">{t('miraie.listSub')}</Txt>
        {phase.acs.map((a, i) => {
          const isAdded = added.has(a.deviceId);
          return (
            <OptionCard
              key={a.deviceId}
              title={a.name}
              {...(a.space ? { subtitle: a.space } : {})}
              icon="ac"
              size="regular"
              index={i}
              disabled={isAdded}
              selected={!isAdded && chosen?.deviceId === a.deviceId}
              {...(isAdded ? { badge: { label: t('miraie.added') } } : {})}
              onPress={() => setPicked(a.deviceId)}
              testID={`miraie-ac-${a.deviceId}`}
            />
          );
        })}
        <Button label={t('miraie.next')} disabled={!chosen} onPress={next} />
      </Column>
    </Screen>
  );
}
