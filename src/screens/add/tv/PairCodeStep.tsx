import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, ErrorLine, Screen, Txt } from '@/ui';
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
      title={t('addTv.pairTitle')}
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
      <Column gap={4}>
        <Txt variant="heading">{t('addTv.codeTitle')}</Txt>
        <OtpCells
          value={code}
          length={props.codeLength}
          invalid={props.wrong}
          onChange={setCode}
          onSubmitEditing={submit}
          accessibilityLabel={t('addTv.codeTitle')}
        />
        {props.wrong ? <ErrorLine text={t('addTv.codeWrong')} /> : null}
        <Button label={t('addTv.codeNew')} variant="ghost" onPress={props.onNewCode} />
      </Column>
    </Screen>
  );
}
