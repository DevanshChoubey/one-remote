import { t } from '@/i18n';
import type { AerView } from '@/services';
import { AER_FRESH_MS, formatNextSpray, formatWhen } from './format';
import { isFlat, isRefillLow } from './screenState';

/** No reading, or one older than `AER_FRESH_MS`. */
export function isStale(view: AerView, now: Date): boolean {
  return !view.status || now.getTime() - new Date(view.status.at).getTime() > AER_FRESH_MS;
}

/** A flat reading counts only while it is fresh; an old one is shown as when it was read. */
export function isFreshFlat(view: AerView, now: Date): boolean {
  return isFlat(view) && !isStale(view, now);
}

/** The home card's first line and the tone it is drawn in. */
export function cardLine(
  view: AerView,
  timeZone: string,
  now: Date,
): { text: string; tone: 'ink2' | 'warn' | 'bad' } {
  if (isFreshFlat(view, now)) return { text: t('aer.cardFlat'), tone: 'bad' };
  if (isRefillLow(view)) return { text: t('aer.cardLow'), tone: 'warn' };
  if (!view.status) return { text: t('aer.notRead'), tone: 'ink2' };
  if (isStale(view, now)) {
    return { text: t('aer.lastRead', { when: formatWhen(view.status.at, now) }), tone: 'ink2' };
  }
  return { text: formatNextSpray(view, timeZone, now), tone: 'ink2' };
}
