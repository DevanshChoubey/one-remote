import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import type { TimeOfDay } from '@/services';

type Opener = (value: TimeOfDay, label?: string) => Promise<TimeOfDay | null>;

/** The inline picker on iPhone: `TimePickerSheet` registers itself here while it is mounted. */
let inline: Opener | null = null;

export function setInlinePicker(opener: Opener | null): void {
  inline = opener;
}

const toDate = (t: TimeOfDay): Date => new Date(2000, 0, 1, t.h, t.m);

/**
 * Asks for a time of day: the system dialog on Android, an inline spinner in a sheet on iPhone
 * (needs a mounted `TimePickerSheet`). Resolves null when dismissed.
 */
export function openTimePicker(value: TimeOfDay, label?: string): Promise<TimeOfDay | null> {
  if (Platform.OS !== 'android') return inline ? inline(value, label) : Promise.resolve(null);
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      mode: 'time',
      value: toDate(value),
      is24Hour: false,
      onValueChange: (_e, date) => resolve({ h: date.getHours(), m: date.getMinutes() }),
      onDismiss: () => resolve(null),
      onError: () => resolve(null),
    });
  });
}

export { toDate as timeToDate };
