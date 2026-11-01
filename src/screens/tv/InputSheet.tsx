import type { ReactElement } from 'react';
import type { TvInput } from '@/core';
import { t } from '@/i18n';
import { Button, Column, Txt } from '@/ui';

/** The TV's inputs as buttons; picking one switches the TV to it and closes the sheet. Inputs with
 *  nothing plugged in are still listed (the TV may not detect every device), but look secondary. */
export function InputSheet(props: {
  inputs: TvInput[] | undefined;
  onPick: (inputId: string) => void;
  onDone: () => void;
}): ReactElement {
  const inputs = props.inputs ?? [];
  return (
    <Column gap={3} testID="tv-inputs">
      <Txt variant="heading">{t('tv.inputsTitle')}</Txt>
      {inputs.length === 0 ? <Txt>{t('tv.inputsNone')}</Txt> : null}
      {inputs.map((input) => (
        <Button
          key={input.id}
          label={input.label}
          variant={input.connected ? 'primary' : 'secondary'}
          accessibilityLabel={
            input.connected ? input.label : t('tv.inputEmpty', { label: input.label })
          }
          onPress={() => {
            props.onPick(input.id);
            props.onDone();
          }}
        />
      ))}
      <Button label={t('tv.inputsDone')} variant="ghost" onPress={props.onDone} />
    </Column>
  );
}
