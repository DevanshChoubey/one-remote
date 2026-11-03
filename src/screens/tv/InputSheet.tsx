import type { ReactElement } from 'react';
import type { TvInput } from '@/core';
import { t } from '@/i18n';
import { Button, Group, ListItem, Sheet, Txt } from '@/ui';

/** The TV's inputs in a sheet; picking one switches the TV to it and closes the sheet. The one the
 *  TV shows now is marked, and inputs with nothing plugged in are listed but cannot be picked. */
export function InputSheet(props: {
  inputs: TvInput[] | undefined;
  currentInputId?: string;
  onPick: (inputId: string) => void;
  onDone: () => void;
}): ReactElement {
  const inputs = props.inputs ?? [];
  return (
    <Sheet
      open
      onClose={props.onDone}
      title={t('tv.inputsTitle')}
      testID="tv-inputs"
      footer={<Button label={t('common.done')} variant="secondary" onPress={props.onDone} />}
    >
      {inputs.length === 0 ? (
        <Txt>{t('tv.inputsNone')}</Txt>
      ) : (
        <Group>
          {inputs.map((input) => (
            <ListItem
              key={input.id}
              title={input.label}
              accessibilityLabel={
                input.connected ? input.label : t('tv.inputEmpty', { label: input.label })
              }
              disabled={!input.connected}
              {...(input.id === props.currentInputId
                ? { badge: { label: t('tv.inputNow'), tone: 'accent' as const } }
                : {})}
              onPress={() => {
                props.onPick(input.id);
                props.onDone();
              }}
            />
          ))}
        </Group>
      )}
    </Sheet>
  );
}
