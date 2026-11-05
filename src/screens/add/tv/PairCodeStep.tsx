import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, ErrorLine, Screen, Spacer } from '@/ui';
import { TextLink } from '@/ui/add';
import { OtpCells } from '@/ui/addtv';

export interface PairCodeStepProps {
  /** True after a code the TV refused. */
  wrong: boolean;
  /** Characters in the code. */
  codeLength: number;
  /** False until the driver is waiting for a code. */
  ready: boolean;
  onSubmit: (code: string) => void;
  onNewCode: () => void;
  onBack: () => void;
}

/** The TV shows a code; the person types it here. */
export function PairCodeStep(props: PairCodeStepProps): ReactElement {
  const [code, setCode] = useState('');
  const submit = (): void => {
    if (props.ready && code.length >= props.codeLength) props.onSubmit(code.toUpperCase());
  };
  return (
    <Screen
      title={t('addTv.codeTitle')}
      largeTitle
      onBack={props.onBack}
      scroll
      footer={
        <Button
          label={t('addTv.codePair')}
          onPress={submit}
          disabled={!props.ready || code.length < props.codeLength}
        />
      }
    >
      {/* The cells sit 12 px lower than the rest of the rhythm (mock `margin: 12px 0 0`). */}
      <Column>
        <Spacer size={3} />
        <OtpCells
          value={code}
          length={props.codeLength}
          invalid={props.wrong}
          onChange={setCode}
          onSubmitEditing={submit}
          accessibilityLabel={t('addTv.codeTitle')}
        />
      </Column>
      {props.wrong ? <ErrorLine text={t('addTv.codeWrong')} /> : null}
      <TextLink label={t('addTv.codeNew')} onPress={props.onNewCode} />
    </Screen>
  );
}
