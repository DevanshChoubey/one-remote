import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { DeviceError } from '@/core';
import type { IrCandidate } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Row, Screen, Txt } from '@/ui';
import { initialIrTest, irTestReducer } from './irTest';

export interface IrTestStepProps {
  kind: 'ac' | 'fan';
  brandName: string;
  candidates: IrCandidate[];
  /** After a Matter pairing: the test is optional and can be skipped. */
  onSkip?: () => void;
  /** A remote id that worked, or 'none' when every candidate failed. */
  onResult(result: string): void;
  onBack?: () => void;
  /** A message to show, e.g. that saving the chosen remote failed. */
  error?: string;
}

export function IrTestStep(props: IrTestStepProps): ReactElement {
  const { ir } = useServices();
  const [state, setState] = useState(() => initialIrTest(props.candidates.map((c) => c.remoteId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which press a Test belongs to: a late result for an earlier one is ignored.
  const inFlight = useRef<string | null>(null);

  const { candidates, onResult } = props;
  const fired = useRef(false);
  useEffect(() => {
    // Nothing to test (a known brand with no codes): go straight to the no-codes screen.
    if (candidates.length === 0 && !fired.current) {
      fired.current = true;
      onResult('none');
    }
  }, [candidates.length, onResult]);

  const remoteId = state.candidates[state.index];
  const plan = remoteId === undefined ? undefined : ir.testPlan(remoteId);
  const press = plan && (state.phase === 'try' ? plan.first : plan.confirm);

  const answer = (e: 'yes' | 'no'): void => {
    if (busy || state.result !== undefined) return;
    inFlight.current = null;
    const next = irTestReducer(state, e);
    setState(next);
    setError(null);
    if (next.result !== undefined) props.onResult(next.result);
  };

  const test = (): void => {
    if (remoteId === undefined || press === undefined) return;
    setBusy(true);
    setError(null);
    const tag = `${state.index}:${state.phase}`;
    inFlight.current = tag;
    ir.sendTest(remoteId, press).then(
      () => {
        if (inFlight.current !== tag) return;
        setBusy(false);
        setState((s) => irTestReducer(s, 'pressed'));
      },
      (e: unknown) => {
        if (inFlight.current !== tag) return;
        setBusy(false);
        setError(
          e instanceof DeviceError && e.code === 'noIrEmitter'
            ? 'addAppliance.testNeedsIr'
            : 'addAppliance.testFailed',
        );
      },
    );
  };

  return (
    <Screen title={t('addAppliance.testTitle')} onBack={props.onBack} scroll>
      <Column gap={4}>
        <Txt variant="heading">
          {t('addAppliance.tryOf', {
            brand: props.brandName,
            n: Math.min(state.index + 1, state.candidates.length),
            total: state.candidates.length,
          })}
        </Txt>
        <Txt color="ink2">
          {t(props.kind === 'ac' ? 'addAppliance.pointAc' : 'addAppliance.pointFan')}
        </Txt>
        {press ? <Txt>{t(`addAppliance.press.${press}`)}</Txt> : null}
        <Button label={t('addAppliance.test')} onPress={test} loading={busy} />
        <Row gap={2}>
          <Button
            label={t('addAppliance.no')}
            variant="secondary"
            disabled={busy}
            onPress={() => answer('no')}
          />
          <Button
            label={t('addAppliance.yes')}
            onPress={() => answer('yes')}
            disabled={!state.pressed || busy}
          />
        </Row>
        <Row
          gap={2}
          justify="center"
          accessibilityLabel={t('addAppliance.progress', {
            n: Math.min(state.index + 1, state.candidates.length),
            total: state.candidates.length,
          })}
        >
          {state.candidates.map((id, i) => (
            <Txt key={id} color={i === state.index ? 'accent' : 'ink2'}>
              {i === state.index ? '●' : '○'}
            </Txt>
          ))}
        </Row>
        {error ? (
          <Txt live color="ink2">
            {t(error)}
          </Txt>
        ) : null}
        {props.error ? (
          <Txt live color="ink2">
            {props.error}
          </Txt>
        ) : null}
        {props.onSkip ? (
          <Button label={t('addAppliance.skip')} variant="ghost" onPress={props.onSkip} />
        ) : null}
      </Column>
    </Screen>
  );
}
