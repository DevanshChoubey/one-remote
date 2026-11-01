import type { TvLinkKind } from '@/core';

/** The i18n key of the "didn't turn on" hint per brand. Each brand lane adds its own line here. */
const WAKE_HINT: Partial<Record<TvLinkKind, string>> = {
  webos: 'tv.wakeFailed',
  samsung: 'tv.wakeFailedSamsung',
};

export function wakeHintKey(kind: TvLinkKind): string {
  return WAKE_HINT[kind] ?? 'tv.wakeFailed';
}
