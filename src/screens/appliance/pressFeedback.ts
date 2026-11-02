import * as Haptics from 'expo-haptics';
import type { PreferenceStore } from '@/services';

/** A light tick on every press, unless the user turned vibration off. Never throws. */
export function pressFeedback(prefs: PreferenceStore): void {
  prefs
    .get()
    .then(
      (p) => (p.haptics ? Haptics.selectionAsync() : undefined),
      () => undefined,
    )
    .catch(() => undefined);
}
