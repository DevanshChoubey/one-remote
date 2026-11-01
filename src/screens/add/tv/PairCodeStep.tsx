import { useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Column, Input, Screen, Txt } from '@/ui';

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
    if (props.ready && code.length > 0) props.onSubmit(code.toUpperCase());
  };
  return (
    <Screen title={t('addTv.pairTitle')} onBack={props.onBack} scroll>
      <Column gap={4}>
        <Txt variant="heading">{t('addTv.codeTitle')}</Txt>
        <Input
          value={code}
          onChangeText={setCode}
          accessibilityLabel={t('addTv.codeTitle')}
          autoCapitalize="characters"
          maxLength={props.codeLength}
          onSubmitEditing={submit}
        />
        {props.wrong ? (
          <Txt live color="danger">
            {t('addTv.codeWrong')}
          </Txt>
        ) : null}
        <Button label={t('addTv.codePair')} onPress={submit} disabled={!props.ready} />
        <Button label={t('addTv.codeNew')} variant="ghost" onPress={props.onNewCode} />
      </Column>
    </Screen>
  );
}
