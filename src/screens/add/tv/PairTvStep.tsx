import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { FoundTv, PairedTv, TvLinkKind } from '@/core';
import { PairError } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, ErrorLine, ResultDisc, Screen, Txt } from '@/ui';
import { PairRing } from '@/ui/addtv';
import { unreachableHintKey } from '@/screens/tv/wakeHint';
import { PairCodeStep } from './PairCodeStep';

const PAIR_SECONDS = 60;
/** Seconds of waiting before the prompt-missing link shows. */
const PROMPT_MISSING_AFTER = 15;
/** How long the success shows before the flow moves on. */
const PAIRED_MS = 600;

export interface PairTvStepProps {
  tv: FoundTv;
  onPaired: (paired: PairedTv) => void;
  onBack: () => void;
  /** Pairing an already added TV again: the success line says so. */
  again?: boolean;
}

function failureText(e: unknown, kind: TvLinkKind): string {
  if (e instanceof PairError) {
    if (e.code === 'denied') return t('addTv.denied');
    if (e.code === 'timeout') return t('addTv.timedOut');
  }
  return t(unreachableHintKey(kind));
}

/** Starts pairing on entry; the user accepts the prompt on the TV. */
export function PairTvStep(props: PairTvStepProps): ReactElement {
  const { tv, secrets, tvBrands } = useServices();
  const onPaired = useRef(props.onPaired);
  useEffect(() => {
    onPaired.current = props.onPaired;
  }, [props.onPaired]);
  const found = props.tv;
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [left, setLeft] = useState(PAIR_SECONDS);
  // Pairing worked: the success shows for a moment, then the flow moves on.
  const [done, setDone] = useState<PairedTv | null>(null);
  const delivered = useRef(false);
  const brand = tvBrands.find((b) => b.kind === found.kind);
  const byCode = brand?.pairing === 'code';
  // The driver is waiting for a code; `wrong` after a refusal.
  const [ask, setAsk] = useState<{ wrong: boolean; n: number } | null>(null);
  const asks = useRef(0);
  const pending = useRef<((code: string | null) => void) | null>(null);
  const dropKey = useCallback(
    (paired: PairedTv): void => {
      // Only the webOS key layout is known here.
      if (paired.link.kind !== 'webos') return;
      const ref = paired.link.clientKeyRef;
      secrets
        .delete(ref)
        .then(() => secrets.delete(`${ref}:usn`))
        .catch((e: unknown) => console.error('Could not drop an unused key', e));
    },
    [secrets],
  );
  const answer = (code: string | null): void => {
    const resolve = pending.current;
    pending.current = null;
    setAsk(null);
    resolve?.(code);
  };

  useEffect(() => {
    let alive = true;
    const askCode = (wrong: boolean): Promise<string | null> =>
      new Promise((resolve) => {
        if (!alive) {
          resolve(null);
          return;
        }
        pending.current = resolve;
        setAsk({ wrong, n: ++asks.current });
      });
    tv.pair(found, { onAllow: () => undefined, askCode }).then(
      (paired) => {
        if (alive) {
          setDone(paired);
          return;
        }
        // Pairing cannot be cancelled (pairTv takes no signal), so a late result is dropped and
        // the key it stored is deleted.
        dropKey(paired);
      },
      (e: unknown) => {
        // Back or a new code resolved the question with null: leave quietly.
        if (e instanceof PairError && e.code === 'cancelled') return;
        if (alive) setFailure(failureText(e, found.kind));
      },
    );
    return () => {
      alive = false;
      const resolve = pending.current;
      pending.current = null;
      resolve?.(null);
    };
  }, [tv, found, attempt, dropKey]);

  useEffect(() => {
    if (failure !== null || byCode || done !== null) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [failure, attempt, byCode, done]);

  useEffect(() => {
    if (done === null) return;
    const id = setTimeout(() => {
      delivered.current = true;
      onPaired.current(done);
    }, PAIRED_MS);
    return () => {
      clearTimeout(id);
      // Left before the flow took it: nobody will use the key this pairing made.
      if (!delivered.current) dropKey(done);
    };
  }, [done, dropKey]);

  const retry = (): void => {
    setAsk(null);
    setFailure(null);
    setLeft(PAIR_SECONDS);
    setAttempt((n) => n + 1);
  };

  if (byCode && failure === null && done === null) {
    return (
      <PairCodeStep
        // A new question or a new attempt starts with an empty field.
        key={`${attempt}-${ask?.n ?? 0}`}
        wrong={ask?.wrong ?? false}
        codeLength={brand?.codeLength ?? 6}
        ready={ask !== null}
        onSubmit={answer}
        onNewCode={retry}
        onBack={() => {
          answer(null);
          props.onBack();
        }}
      />
    );
  }

  const pairedText = props.again ? t('addTv.paired') : t('addTv.pairedFirst');
  const elapsed = PAIR_SECONDS - left;
  const phase = done !== null ? 'ok' : failure !== null ? 'bad' : 'wait';
  // A code pairing has no countdown, so its result is a plain disc.
  const art = byCode ? (
    phase === 'ok' ? (
      <ResultDisc kind="ok" label={pairedText} />
    ) : (
      <ResultDisc kind="bad" label={failure ?? ''} />
    )
  ) : (
    <PairRing secondsLeft={left} total={PAIR_SECONDS} phase={phase} />
  );

  return (
    <Screen title={t('addTv.pairTitle')} onBack={props.onBack} scroll>
      <Column gap={4} align="center">
        {art}
        {done !== null ? (
          <Txt variant="heading" live>
            {pairedText}
          </Txt>
        ) : failure === null ? (
          <>
            <Txt variant="heading">{t('addTv.pairAllow')}</Txt>
            <Txt color="ink2">{t('addTv.pairBody')}</Txt>
            <Txt live>{t('addTv.waiting', { seconds: left })}</Txt>
            {elapsed >= PROMPT_MISSING_AFTER ? (
              <Button label={t('addTv.promptMissing')} variant="ghost" onPress={retry} />
            ) : null}
          </>
        ) : (
          <>
            <ErrorLine text={failure} />
            <Button label={t('addTv.tryAgain')} onPress={retry} />
          </>
        )}
      </Column>
    </Screen>
  );
}
