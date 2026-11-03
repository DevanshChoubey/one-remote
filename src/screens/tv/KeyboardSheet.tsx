import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Button, Field, Sheet } from '@/ui';

const DEBOUNCE_MS = 300;

/** A text field whose whole content goes to the TV, 300 ms after the last change. */
export function KeyboardSheet(props: {
  onText: (text: string) => void;
  onDone: () => void;
}): ReactElement {
  const [text, setText] = useState('');
  const pending = useRef<{ text: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const onText = useRef(props.onText);
  useEffect(() => {
    onText.current = props.onText;
  }, [props.onText]);

  const flush = (): void => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    onText.current(p.text);
  };
  const change = (next: string): void => {
    setText(next);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { text: next, timer: setTimeout(flush, DEBOUNCE_MS) };
  };
  // Leaving the sheet (Done, or the TV going away) still sends what was typed last.
  useEffect(() => flush, []);

  const done = (): void => {
    flush();
    props.onDone();
  };

  return (
    <Sheet
      open
      onClose={done}
      title={t('tv.keyboard')}
      testID="tv-keyboard"
      footer={<Button label={t('common.done')} onPress={done} />}
    >
      <Field
        label={t('tv.keyboardField')}
        value={text}
        onChangeText={change}
        autoFocus
        onSubmitEditing={done}
      />
    </Sheet>
  );
}
