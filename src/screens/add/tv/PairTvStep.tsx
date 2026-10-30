import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { FoundTv, PairedTv } from '@/core';
import { PairError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Screen, Touchable, Txt } from '@/ui';

const PAIR_SECONDS = 60;

export interface PairTvStepProps {
  tv: FoundTv;
  onPaired: (paired: PairedTv) => void;
  onBack: () => void;
}

function failureText(e: unknown): string {
  if (e instanceof PairError) {
    if (e.code === 'denied') return t('addTv.denied');
    if (e.code === 'timeout') return t('addTv.timedOut');
  }
  return t('addTv.unreachable');
}

/** Starts pairing on entry; the user accepts the prompt on the TV. */
export function PairTvStep(props: PairTvStepProps): ReactElement {
  const { tv, secrets } = useServices();
  const onPaired = useRef(props.onPaired);
  useEffect(() => {
    onPaired.current = props.onPaired;
  }, [props.onPaired]);
  const found = props.tv;
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [left, setLeft] = useState(PAIR_SECONDS);

  useEffect(() => {
    let alive = true;
    tv.pair(found, () => undefined).then(
      (paired) => {
        if (alive) {
          onPaired.current(paired);
          return;
        }
        // Pairing cannot be cancelled (pairTv takes no signal), so a late result is dropped and
        // the key it stored is deleted.
        secrets
          .delete(paired.link.clientKeyRef)
          .catch((e: unknown) => console.error('Could not drop an unused key', e));
      },
      (e: unknown) => {
        if (alive) setFailure(failureText(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [tv, secrets, found, attempt]);

  useEffect(() => {
    if (failure !== null) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [failure, attempt]);

  const retry = (): void => {
    setFailure(null);
    setLeft(PAIR_SECONDS);
    setAttempt((n) => n + 1);
  };

  return (
    <Screen title={t('addTv.pairTitle')} onBack={props.onBack} scroll>
      <Column gap={4}>
        <Txt variant="heading">{t('addTv.pairAllow')}</Txt>
        <Txt color="ink2">{t('addTv.pairBody')}</Txt>
        {failure === null ? (
          <>
            <Txt live>{t('addTv.waiting', { seconds: left })}</Txt>
            <Touchable onPress={retry} accessibilityLabel={t('addTv.promptMissing')}>
              <Txt color="accent">{t('addTv.promptMissing')}</Txt>
            </Touchable>
          </>
        ) : (
          <>
            <Txt live color="danger">
              {failure}
            </Txt>
            <Button label={t('addTv.tryAgain')} onPress={retry} />
          </>
        )}
      </Column>
    </Screen>
  );
}
