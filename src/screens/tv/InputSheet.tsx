import type { ReactElement } from 'react';
import type { TvInput } from '@/core';
import { t } from '@/i18n';
import { Box, Button, Group, ListItem, Sheet, Txt } from '@/ui';

/** The TV's inputs in a sheet; picking one switches the TV to it and closes the sheet. The one the
 *  TV shows now is marked, and inputs with nothing plugged in are listed but cannot be picked. */
export function InputSheet(props: {
  open: boolean;
  onClosed: () => void;
  inputs: TvInput[] | undefined;
  currentInputId?: string;
  onPick: (inputId: string) => void;
  onDone: () => void;
}): ReactElement {
  const inputs = props.inputs ?? [];
  return (
    <Sheet
      open={props.open}
      onClosed={props.onClosed}
      onClose={props.onDone}
      title={t('tv.inputsTitle')}
      testID="tv-inputs"
      closeButton={false}
      footer={<Button label={t('common.done')} onPress={props.onDone} />}
    >
      {inputs.length === 0 ? (
        <Txt live color="ink2">
          {t('tv.inputsNone')}
        </Txt>
      ) : (
        <Group>
          {inputs.map((input) =>
            input.connected ? (
              <ListItem
                key={input.id}
                title={input.label}
                {...(input.id === props.currentInputId
                  ? { badge: { label: t('tv.inputNow'), tone: 'accent' as const } }
                  : {})}
                onPress={() => {
                  props.onPick(input.id);
                  props.onDone();
                }}
              />
            ) : (
              // Nothing plugged in: said in the row, faded, and not a button (the mock's quiet row).
              <Box key={input.id} opacity={0.7} testID={`tv-input-empty-${input.id}`}>
                <ListItem title={t('tv.inputEmpty', { label: input.label })} />
              </Box>
            ),
          )}
        </Group>
      )}
    </Sheet>
  );
}
