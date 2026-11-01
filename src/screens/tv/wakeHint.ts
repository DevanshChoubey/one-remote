import type { TvLinkKind } from '@/core';

/** The i18n key of the "didn't turn on" hint per brand. Each brand lane adds its own line here. */
const WAKE_HINT: Partial<Record<TvLinkKind, string>> = {
  webos: 'tv.wakeFailed',
  androidtv: 'tv.wakeFailedAndroidTv',
  samsung: 'tv.wakeFailedSamsung',
};

export function wakeHintKey(kind: TvLinkKind): string {
  return WAKE_HINT[kind] ?? 'tv.wakeFailed';
}

/** The i18n key of the "couldn't reach the TV" line per brand; the LG line is the default. */
const UNREACHABLE_HINT: Partial<Record<TvLinkKind, string>> = {
  androidtv: 'addTv.unreachableAndroidTv',
};

export function unreachableHintKey(kind: TvLinkKind): string {
  return UNREACHABLE_HINT[kind] ?? 'addTv.unreachable';
}
