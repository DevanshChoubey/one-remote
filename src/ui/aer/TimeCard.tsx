import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import type { TimeOfDay } from '@/services';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Box, Row, Touchable, Txt } from '../primitives';
import { setInlinePicker, timeToDate } from './timePicker';

/** '6:00', 'pm'. */
function parts(time: TimeOfDay): { hm: string; ap: string } {
  const h12 = time.h % 12 === 0 ? 12 : time.h % 12;
  return { hm: `${h12}:${String(time.m).padStart(2, '0')}`, ap: time.h < 12 ? 'am' : 'pm' };
}

export interface TimeCardProps {
  label: string;
  time: TimeOfDay;
  /** Outlined in danger (the end is not after the start). */
  error?: boolean;
  onPress: () => void;
  testID?: string;
}

/** Mock `.tcard`: the label, then the time at 32 px with am or pm beside it. */
export function TimeCard(props: TimeCardProps): ReactElement {
  const { hm, ap } = parts(props.time);
  const card = (
    <Box
      bg="surface"
      border={props.error ? 'danger' : 'line'}
      radius="md"
      shadow="card"
      px={4}
      py={3}
      gap={1}
    >
      <Txt variant="captionBold" color="ink2">
        {props.label}
      </Txt>
      <Row align="end" gap={1}>
        <Txt size="ring" lineHeight={1.1} weight="bold" tabular>
          {hm}
        </Txt>
        <Txt variant="bodyBold" color="ink2">
          {ap}
        </Txt>
      </Row>
    </Box>
  );
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={t('aer.timeLabel', { label: props.label, time: `${hm} ${ap}` })}
      accessibilityRole="button"
      radius="md"
      pressedBg="surface2"
      testID={props.testID}
    >
      {/* The mock's 2 px danger outline: the 1 px border twice. */}
      {props.error ? (
        <Box border="danger" radius="md">
          {card}
        </Box>
      ) : (
        card
      )}
    </Touchable>
  );
}

/**
 * The iPhone picker: an inline spinner in a bottom sheet. Mount it once on the screen; while it is
 * mounted `openTimePicker` opens it. Nothing happens after it unmounts.
 */
export function TimePickerSheet(): ReactElement {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<TimeOfDay>({ h: 0, m: 0 });
  const answer = useRef<((time: TimeOfDay | null) => void) | null>(null);
  const latest = useRef<TimeOfDay>(picked);

  useEffect(() => {
    setInlinePicker((value, label) => {
      answer.current?.(null);
      latest.current = value;
      setPicked(value);
      setTitle(label ?? '');
      setOpen(true);
      return new Promise((resolve) => {
        answer.current = resolve;
      });
    });
    return () => {
      setInlinePicker(null);
      answer.current?.(null);
      answer.current = null;
    };
  }, []);

  const finish = (time: TimeOfDay | null): void => {
    const resolve = answer.current;
    answer.current = null;
    setOpen(false);
    resolve?.(time);
  };

  return (
    <Sheet
      open={open}
      onClose={() => finish(null)}
      title={title}
      footer={<Button label={t('aer.done')} onPress={() => finish(latest.current)} />}
      testID="time-picker"
    >
      <DateTimePicker
        mode="time"
        display="spinner"
        value={timeToDate(picked)}
        onValueChange={(_e, date) => {
          latest.current = { h: date.getHours(), m: date.getMinutes() };
          setPicked(latest.current);
        }}
      />
    </Sheet>
  );
}
