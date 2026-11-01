import * as Haptics from 'expo-haptics';

/** A light tick for a key press, when the haptics preference is on. */
export function pressFeedback(enabled: boolean): void {
  if (!enabled) return;
  Haptics.selectionAsync().catch(() => undefined);
}
